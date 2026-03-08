"""
ART Training Worker for Office OS on Northflank H100.

Uses OpenPipe ART LocalBackend for GRPO training with LoRA adapters.
Runs as a simple HTTP server using standard asyncio (no uvloop conflict).

Runs alongside vLLM on a different port:
  - vLLM on port 8080: serves inference
  - This worker on port 8081: accepts training requests, runs ART GRPO

Usage:
    python training/train_worker.py --port 8081 --base-model Qwen/Qwen3-8B
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Any
import threading

# Force standard asyncio — fixes nest_asyncio/uvloop conflict
asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

_backend = None
_models: dict[str, Any] = {}
_base_model = "Qwen/Qwen3-8B"
_train_steps: dict[str, int] = {}
_lock = threading.Lock()


def _init_backend():
    """Initialize ART LocalBackend."""
    global _backend
    if _backend is not None:
        return True
    try:
        import art
        from art.local import LocalBackend
        _backend = LocalBackend()
        logger.info("ART LocalBackend initialized successfully")
        return True
    except Exception as e:
        logger.error(f"Failed to init ART backend: {e}")
        return False


async def _register_model(role: str, base_model: str | None = None):
    """Register a trainable model for a role."""
    if role in _models:
        return _models[role]
    import art
    model = art.TrainableModel(
        name=f"office-os-{role}-{datetime.now().strftime('%Y%m%d')}",
        project="office-os",
        base_model=base_model or _base_model,
    )
    await model.register(_backend)
    _models[role] = model
    _train_steps[role] = 0
    logger.info(f"Registered model for {role}: {model.name}")
    return model


async def _train_role(role: str, base_model: str, learning_rate: float, trajectories_data: list) -> dict:
    """Train a single role with GRPO via ART."""
    if not _init_backend():
        return {"status": "error", "role": role, "error": "Backend not available"}

    import art
    model = await _register_model(role, base_model)

    trajectories = []
    for t in trajectories_data:
        tool_call_content = json.dumps(t["assistant_response"])
        traj = art.Trajectory(
            messages_and_choices=[
                {"role": "system", "content": t["system_prompt"]},
                {"role": "user", "content": t["user_message"]},
                {"role": "assistant", "content": None, "tool_calls": [{
                    "id": f"call_{len(trajectories)}",
                    "type": "function",
                    "function": {
                        "name": "submit_action",
                        "arguments": tool_call_content,
                    },
                }]},
            ],
            reward=t["reward"],
            metadata={"role": role},
        )
        trajectories.append(traj)

    if not trajectories:
        return {"status": "skipped", "role": role, "trajectories_used": 0}

    try:
        groups = [art.TrajectoryGroup(trajectories)]
        result = await _backend.train(model, groups, learning_rate=learning_rate)
        await model.log(groups, metrics=result.metrics, step=result.step, split="train")
        _train_steps[role] = result.step

        logger.info(f"Trained {role}: step={result.step}, trajs={len(trajectories)}, metrics={result.metrics}")
        return {
            "status": "trained",
            "role": role,
            "step": result.step,
            "trajectories_used": len(trajectories),
            "model_name": model.get_inference_name(),
            "metrics": result.metrics,
        }
    except Exception as e:
        logger.error(f"Training failed for {role}: {e}")
        return {"status": "error", "role": role, "error": str(e)}


class TrainHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self._json(200, {
                "status": "ok",
                "backend_ready": _backend is not None,
                "models": list(_models.keys()),
                "train_steps": _train_steps,
                "base_model": _base_model,
            })
        elif self.path == "/models":
            self._json(200, {"models": {r: {"step": s} for r, s in _train_steps.items()}, "base_model": _base_model})
        else:
            self._json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path == "/train":
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                self._json(400, {"error": "Invalid JSON"})
                return

            role = data.get("role", "")
            if not role:
                self._json(400, {"error": "Missing 'role'"})
                return

            logger.info(f"Training {role}: {len(data.get('trajectories', []))} trajectories")
            with _lock:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    result = loop.run_until_complete(_train_role(
                        role, data.get("base_model", _base_model),
                        data.get("learning_rate", 1e-5),
                        data.get("trajectories", []),
                    ))
                finally:
                    loop.close()
            self._json(200, result)
        else:
            self._json(404, {"error": "Not found"})

    def _json(self, code, data):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def log_message(self, fmt, *args):
        logger.info(f"{self.client_address[0]} - {fmt % args}")


def main():
    import argparse
    p = argparse.ArgumentParser(description="ART Training Worker")
    p.add_argument("--port", type=int, default=8081)
    p.add_argument("--host", type=str, default="0.0.0.0")
    p.add_argument("--base-model", type=str, default="Qwen/Qwen3-8B")
    args = p.parse_args()

    global _base_model
    _base_model = args.base_model

    logger.info(f"ART Training Worker on {args.host}:{args.port}")
    logger.info(f"Base model: {_base_model}")
    logger.info(f"Using standard asyncio (no uvloop)")
    logger.info(f"Endpoints: GET /health, GET /models, POST /train")

    _init_backend()

    server = HTTPServer((args.host, args.port), TrainHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
