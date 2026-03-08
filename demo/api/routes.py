"""
REST + WebSocket routes for SuperOffice GTM demo.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel

from rl_environment import GTMEnvironment, SCENARIOS, AGENT_ORDER
from claude_bridge import get_agent_reasoning

router = APIRouter()

# ─── Shared env instance (one per server process) ────────────────────────────

_env = GTMEnvironment()
_ws_connections: list[WebSocket] = []


# ─── REST Models ─────────────────────────────────────────────────────────────

class ResetRequest(BaseModel):
    scenario: str = "baseline"


class EventRequest(BaseModel):
    type: str
    description: str


# ─── REST Endpoints ───────────────────────────────────────────────────────────

@router.post("/api/reset")
async def reset(req: ResetRequest):
    state = _env.reset(req.scenario)
    await _broadcast({"type": "reset", "state": state.model_dump()})
    return state.model_dump()


@router.post("/api/step")
async def step():
    result = _env.step()
    state = result["state"]

    # Generate Claude reasoning
    kpis_dict = state.kpis.model_dump()
    reasoning = await get_agent_reasoning(
        agent_id=result["active_agent"] or "ceo",
        task=result["task"],
        kpis=kpis_dict,
        phase=state.phase,
        scenario=state.scenario,
        step=state.step,
    )

    # Add reasoning to conversation log
    if reasoning and result["active_agent"]:
        from rl_environment import Message
        state.conversations.append(Message(
            step=state.step,
            from_agent=result["active_agent"],
            to_agent="self",
            text=reasoning,
            msg_type="reasoning",
        ))

    payload = {
        "type": "step",
        "activeAgent": result["active_agent"],
        "task": result["task"],
        "reasoning": reasoning,
        "kpis": kpis_dict,
        "reward": result["reward"],
        "handoffTo": result["handoff_to"],
        "handoffMessage": result["handoff_message"],
        "cooperationScore": result["cooperation_score"],
        "globalReward": state.global_reward,
        "step": state.step,
        "phase": state.phase,
        "done": state.done,
        "events": result.get("events", []),
        "state": state.model_dump(),
    }

    await _broadcast(payload)
    return payload


@router.get("/api/state")
async def get_state():
    return _env.get_state().model_dump()


@router.get("/api/metrics")
async def get_metrics():
    state = _env.get_state()
    return {"kpi_history": [k.model_dump() for k in state.kpi_history]}


@router.get("/api/conversations")
async def get_conversations():
    state = _env.get_state()
    return {"conversations": [m.model_dump() for m in state.conversations]}


@router.post("/api/event")
async def inject_event(req: EventRequest):
    from rl_environment import SimEvent, Message
    state = _env.get_state()
    ev = SimEvent(step=state.step, type=req.type, description=req.description)
    state.events.append(ev)
    state.conversations.append(Message(
        step=state.step,
        from_agent="system",
        to_agent="all",
        text=req.description,
        msg_type="event",
    ))
    await _broadcast({"type": "event", "event": ev.model_dump()})
    return {"ok": True, "event": ev.model_dump()}


@router.post("/api/scenario/{name}")
async def set_scenario(name: str):
    if name not in SCENARIOS:
        raise HTTPException(status_code=400, detail=f"Unknown scenario: {name}")
    state = _env.set_scenario(name)
    await _broadcast({"type": "scenario_change", "scenario": name, "state": state.model_dump()})
    return state.model_dump()


@router.get("/api/scenarios")
async def list_scenarios():
    return {"scenarios": list(SCENARIOS.keys())}


# ─── WebSocket ────────────────────────────────────────────────────────────────

@router.websocket("/ws/live")
async def websocket_live(websocket: WebSocket):
    await websocket.accept()
    _ws_connections.append(websocket)
    # Send current state on connect
    try:
        state = _env.get_state()
        await websocket.send_text(json.dumps({
            "type": "connected",
            "state": state.model_dump(),
        }, default=str))
        while True:
            # Keep alive; client sends pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in _ws_connections:
            _ws_connections.remove(websocket)


# ─── Broadcast helper ─────────────────────────────────────────────────────────

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
