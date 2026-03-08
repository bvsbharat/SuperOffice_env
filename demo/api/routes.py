"""
REST + WebSocket routes for SuperOffice GTM demo.

Uses the real office_os RL environment via rl_bridge.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel

from rl_bridge import OfficeOsBridge

logger = logging.getLogger(__name__)

router = APIRouter()

# Shared bridge instance (created lazily on first reset or state request)
_bridge: OfficeOsBridge | None = None
_ws_connections: list[WebSocket] = []
# Track the currently configured model/provider so /api/config is always accurate
_active_config: dict = {"model": "unknown", "provider": "bedrock"}


def _get_bridge() -> OfficeOsBridge:
    """Get or create the bridge instance using server config."""
    global _bridge, _active_config
    if _bridge is None:
        # When run as `python server.py`, the module is in sys.modules as '__main__'.
        # Avoid `from server import bridge_config` which collides with office_os/server/ package.
        import sys as _sys
        _main = _sys.modules.get("__main__")
        bridge_config = getattr(_main, "bridge_config", None)
        if bridge_config is None:
            # Fallback: uvicorn imports it as 'server'
            import importlib.util
            _spec = importlib.util.spec_from_file_location(
                "demo_api_server",
                os.path.join(os.path.dirname(__file__), "server.py"),
            )
            _server_mod = importlib.util.module_from_spec(_spec)
            _spec.loader.exec_module(_server_mod)
            bridge_config = _server_mod.bridge_config
        _bridge = OfficeOsBridge(
            provider=bridge_config["provider"],
            model=bridge_config["model"],
            days=bridge_config["days"],
            art_endpoint=bridge_config["art_endpoint"],
            art_model=bridge_config["art_model"],
            art_api_key=bridge_config["art_api_key"],
            aws_region=bridge_config["aws_region"],
        )
        _active_config = {"model": bridge_config["model"], "provider": bridge_config["provider"]}
    return _bridge


# --- REST Endpoints ---

@router.post("/api/reset")
async def reset():
    bridge = _get_bridge()
    loop = asyncio.get_event_loop()
    state = await loop.run_in_executor(None, bridge.reset)
    await _broadcast({"type": "reset", "state": state})
    return state


@router.post("/api/step")
async def step():
    bridge = _get_bridge()
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, bridge.step)
    await _broadcast(result)
    return result


@router.get("/api/state")
async def get_state():
    bridge = _get_bridge()
    return bridge.get_state()


@router.get("/api/metrics")
async def get_metrics():
    bridge = _get_bridge()
    return {"kpi_history": bridge.get_kpi_history()}


@router.get("/api/conversations")
async def get_conversations():
    bridge = _get_bridge()
    return {"conversations": bridge.get_conversations()}


@router.get("/api/config")
async def get_config():
    # Seed _active_config from server startup config if still unknown
    if _active_config["model"] == "unknown":
        import sys as _sys
        _main = _sys.modules.get("__main__")
        bc = getattr(_main, "bridge_config", None)
        if bc:
            return {"provider": bc.get("provider", "bedrock"), "model": bc.get("model", "unknown")}
    return _active_config


class ReconfigureRequest(BaseModel):
    model: str
    provider: str = "bedrock"


@router.post("/api/reconfigure")
async def reconfigure(req: ReconfigureRequest):
    global _bridge, _active_config
    import sys as _sys
    _main = _sys.modules.get("__main__")
    bc = getattr(_main, "bridge_config", None)
    if bc is not None:
        bc["model"] = req.model
        bc["provider"] = req.provider
    # Track new model immediately so /api/config reflects it without needing a reset
    _active_config = {"model": req.model, "provider": req.provider}
    # Destroy current bridge so next reset picks up new model
    _bridge = None
    return {"provider": req.provider, "model": req.model, "status": "reconfigured"}


_RUBRIC_TEXT = """
MULTI-AGENT GTM SIMULATION — REWARD FUNCTION DESIGN
7 agents: CEO, Dev, Marketing, Sales, Content, HR, Customer
Episode: 10 days, 14 turns/day (one agent acts per turn, sequential)

PIPELINE STAGE TRANSITION REWARDS (points per agent when a customer moves to that stage):
  visitor:     content +0.5
  lead:        content +1.0, marketing +1.5
  qualified:   sales +1.0, hr +0.3
  demo:        sales +1.5, dev +0.5
  proposal:    sales +2.0
  closed_won:  sales +10.0, content +2.0, marketing +3.0, dev +2.0, ceo +5.0, hr +1.0, customer +2.0
  closed_lost: sales -3.0, marketing -1.0, ceo -2.0
  churned:     dev -5.0, sales -3.0, content -1.0, marketing -1.0, ceo -3.0, customer -5.0
CONTRACT TIER MULTIPLIERS on closed_won: monthly ×1.0, 6-month ×2.0, annual ×3.0

DIRECT ACTION REWARDS (on successful execution):
  dev:      SHIP_RELEASE +3.0, BUILD_FEATURE +0.5
  content:  publish any piece +0.5
  ceo:      SET_OKRS +1.0, SEND_DIRECTIVE +0.3
  hr:       RESOLVE_BLOCKER +1.5, PLAN_SPRINT +0.5
  customer: REFER_LEAD +2.0, RENEW_CONTRACT +3.0, EVALUATE_PRODUCT +0.3, GIVE_FEEDBACK +0.5

KPI DELTA REWARDS (per-step KPI improvement):
  website_traffic +1000: marketing/content +1.0, others +0.2
  revenue +5000:         sales +2.0 (×2 multiplier), others +0.5
  pipeline_value +10000: sales +1.0

COLLABORATION BONUSES (emergent cooperative reward):
  content writes about a shipped feature:           +1.0 (collab with dev)
  sales demos a lead with prior content touchpoints: +0.5 (collab with content)
  dev builds feature from customer feedback:         +1.0 (collab with sales/customer)
  marketing runs campaign with published content:    +0.5 (collab with content)

PENALTIES:
  any agent: failed action -1.0
  sales:     stale lead (>4 days no contact) -0.5 per lead
  marketing: budget below $1,000 -0.5
  dev:       vaporware violation (content references unshipped feature) -5.0

GLOBAL REWARD = sum of all per-agent rewards across the episode
"""


@router.post("/api/validate-rubric")
async def validate_rubric():
    """Use Claude Opus 4.6 to validate the reward rubric against RL best practices."""
    import sys as _sys
    import anthropic as _anthropic
    import json as _json

    _main = _sys.modules.get("__main__")
    bc = getattr(_main, "bridge_config", None) or {}
    aws_region = bc.get("aws_region", "us-east-1")

    # Split into system + user exactly as llm_agent._call_structured does
    system_prompt = (
        "You are a reinforcement learning expert specialising in LLM agent training, "
        "multi-agent systems, and reward function design. "
        "When asked to evaluate a reward function, return ONLY a valid JSON object — "
        "no markdown fences, no explanation outside the JSON."
    )
    user_msg = (
        "Evaluate the reward function below against established RL best practices:\n"
        "- PPO / GRPO: policy stability, KL divergence, trust regions\n"
        "- RLHF: reward shaping, alignment, calibration, reward hacking\n"
        "- Multi-agent RL: credit assignment, cooperative incentives, emergent behaviour\n"
        "- Practical RL: dense vs sparse rewards, reward scaling, exploration\n\n"
        + _RUBRIC_TEXT +
        "\nReturn this JSON structure (no other text):\n"
        "{\n"
        '  "overall_score": <integer 0-100>,\n'
        '  "grade": "<A|B|C|D|F>",\n'
        '  "summary": "<2-3 sentence overall assessment>",\n'
        '  "strengths": [\n'
        '    {"title": "...", "detail": "...", "principle": "<RL principle>"}\n'
        "  ],\n"
        '  "gaps": [\n'
        '    {"title": "...", "detail": "...", "severity": "<high|medium|low>", "principle": "..."}\n'
        "  ],\n"
        '  "recommendations": [\n'
        '    {"title": "...", "detail": "...", "priority": "<high|medium|low>", "impact": "..."}\n'
        "  ]\n"
        "}"
    )

    try:
        import traceback as _tb
        import os as _os

        # Build kwargs for AnthropicBedrock — mirror the same pattern as llm_agent.py
        bedrock_kwargs: dict = {"aws_region": aws_region}
        if _os.environ.get("AWS_ACCESS_KEY_ID"):
            bedrock_kwargs["aws_access_key"] = _os.environ["AWS_ACCESS_KEY_ID"]
        if _os.environ.get("AWS_SECRET_ACCESS_KEY"):
            bedrock_kwargs["aws_secret_key"] = _os.environ["AWS_SECRET_ACCESS_KEY"]
        if _os.environ.get("AWS_SESSION_TOKEN"):
            bedrock_kwargs["aws_session_token"] = _os.environ["AWS_SESSION_TOKEN"]

        # Validation uses Opus 4.6 for expert-quality RL analysis
        validation_model = "us.anthropic.claude-opus-4-6-v1[1m]"  # user-confirmed ID
        logger.info("validate-rubric: using model %s", validation_model)

        client = _anthropic.AnthropicBedrock(**bedrock_kwargs)

        def _call():
            # Same pattern as llm_agent._call_structured: system + user message
            resp = client.messages.create(
                model=validation_model,
                max_tokens=2048,
                system=system_prompt,
                messages=[{"role": "user", "content": user_msg}],
            )
            return resp.content[0].text.strip()

        loop = asyncio.get_running_loop()
        text = await loop.run_in_executor(None, _call)
        start = text.find("{")
        end = text.rfind("}") + 1
        if start < 0 or end <= start:
            raise ValueError(f"No JSON in response. Raw text: {text[:300]}")
        result = _json.loads(text[start:end])
        result["validated_by"] = validation_model
        return result
    except Exception as e:
        detail = f"{type(e).__name__}: {e}"
        logger.error("validate-rubric failed: %s\n%s", detail, _tb.format_exc())
        raise HTTPException(status_code=500, detail=detail)


@router.get("/api/scenarios")
async def list_scenarios():
    # Real env has no discrete scenarios; return empty for compatibility
    return {"scenarios": []}


# --- WebSocket ---

@router.websocket("/ws/live")
async def websocket_live(websocket: WebSocket):
    await websocket.accept()
    _ws_connections.append(websocket)
    try:
        bridge = _get_bridge()
        state = bridge.get_state()
        await websocket.send_text(json.dumps({
            "type": "connected",
            "state": state,
        }, default=str))
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in _ws_connections:
            _ws_connections.remove(websocket)


# --- Broadcast helper ---

async def _broadcast(payload: dict):
    dead = []
    for ws in _ws_connections:
        try:
            await ws.send_text(json.dumps(payload, default=str))
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in _ws_connections:
            _ws_connections.remove(ws)
