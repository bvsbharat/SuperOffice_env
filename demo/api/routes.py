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
