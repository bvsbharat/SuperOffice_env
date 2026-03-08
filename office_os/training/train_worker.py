"""
ART Training + Inference Worker for Office OS on Northflank H100.

Uses OpenPipe ART LocalBackend which manages its own internal vLLM.
One process handles everything: inference AND training.

Architecture:
  - ONE shared TrainableModel (each register() loads ~10GB, can't fit 7)
  - All 7 roles train through the same model sequentially
  - Role differentiation comes from system prompts in the trajectories
  - Single LoRA adapter gets updated after each training step
  - vLLM automatically loads the updated LoRA — no restart needed

Usage:
    python training/train_worker.py --port 8081 --base-model Qwen/Qwen2.5-3B-Instruct
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
_shared_model = None  # Single shared TrainableModel for all roles
_base_model = "Qwen/Qwen2.5-3B-Instruct"
_train_steps: dict[str, int] = {}  # Per-role training step counts
_global_step: int = 0  # Global training step across all roles
_inference_url: str = ""
_lock = threading.Lock()

ALL_ROLES = ["ceo", "dev", "marketing", "sales", "content", "hr", "customer"]


def _init_backend():
    """Initialize ART LocalBackend — starts internal vLLM automatically."""
    global _backend
    if _backend is not None:
        return True
    try:
        from art.local import LocalBackend
        _backend = LocalBackend()
        logger.info("ART LocalBackend initialized (manages internal vLLM)")
        return True
    except Exception as e:
        logger.error(f"Failed to init ART backend: {e}")
        return False


async def _init_shared_model():
    """Register ONE shared model on startup. All roles train through this model."""
    global _shared_model, _inference_url

    if not _init_backend():
        return

    import art
    _shared_model = art.TrainableModel(
        name=f"office-os-shared-{datetime.now().strftime('%Y%m%d')}",
        project="office-os",
        base_model=_base_model,
    )
    await _shared_model.register(_backend)

    # Capture ART's internal vLLM URL
    if hasattr(_shared_model, 'inference_base_url') and _shared_model.inference_base_url:
        _inference_url = _shared_model.inference_base_url
        logger.info(f"ART vLLM inference URL: {_inference_url}")

    # Initialize step counters for all roles
    for role in ALL_ROLES:
        _train_steps[role] = 0

    logger.info(f"Shared model registered: {_shared_model.name}")
    logger.info("All 7 roles train through this single model (differentiated by system prompts)")


async def _train_role(role: str, base_model: str, learning_rate: float, trajectories_data: list) -> dict:
    """Train a single role's data through the shared model. LoRA auto-loaded into vLLM."""
    global _global_step

    if _backend is None:
        if not _init_backend():
            return {"status": "error", "role": role, "error": "Backend not available"}

    if _shared_model is None:
        return {"status": "error", "role": role, "error": "Shared model not initialized"}

    import art

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
        result = await _backend.train(_shared_model, groups, learning_rate=learning_rate)
        await _shared_model.log(groups, metrics=result.metrics, step=result.step, split="train")

        _global_step = result.step
        _train_steps[role] = _train_steps.get(role, 0) + 1

        # Get updated model name (includes LoRA) for inference
        inference_name = _shared_model.get_inference_name()

        logger.info(f"Trained {role}: global_step={result.step}, role_step={_train_steps[role]}, trajs={len(trajectories)}, model={inference_name}")
        return {
            "status": "trained",
            "role": role,
            "step": result.step,
            "role_step": _train_steps[role],
            "trajectories_used": len(trajectories),
            "model_name": inference_name,
            "inference_url": _inference_url,
            "metrics": result.metrics,
        }
    except Exception as e:
        logger.error(f"Training failed for {role}: {e}")
        return {"status": "error", "role": role, "error": str(e)}


class Handler(BaseHTTPRequestHandler):
    """HTTP handler for training + inference proxy."""

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {
                "status": "ok",
                "backend_ready": _backend is not None,
                "model_ready": _shared_model is not None,
                "inference_url": _inference_url,
                "global_step": _global_step,
                "train_steps": _train_steps,
                "base_model": _base_model,
            })
        elif self.path == "/models":
            self._json(200, {
                "shared_model": _shared_model.name if _shared_model else None,
                "train_steps": _train_steps,
                "global_step": _global_step,
                "base_model": _base_model,
                "inference_url": _inference_url,
            })
        elif self.path.startswith("/v1/"):
            self._proxy_to_vllm("GET")
        else:
            self._json(404, {"error": "Not found"})

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))

        if self.path == "/train":
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

        elif self.path.startswith("/v1/"):
            self._proxy_to_vllm("POST", body)
        else:
            self._json(404, {"error": "Not found"})

    def _proxy_to_vllm(self, method: str, body: bytes = b""):
        """Forward request to ART's internal vLLM."""
        if not _inference_url:
            self._json(503, {"error": "vLLM not ready yet. Call /health to check status."})
            return

        try:
            import urllib.request
            url = f"{_inference_url.rstrip('/')}{self.path}"
            req = urllib.request.Request(
                url, data=body if body else None, method=method,
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                result = resp.read()
                self.send_response(resp.status)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(result)
        except Exception as e:
            logger.error(f"Proxy error: {e}")
            self._json(502, {"error": f"vLLM proxy failed: {e}"})

    def _json(self, code, data):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def log_message(self, fmt, *args):
        logger.info(f"{self.client_address[0]} - {fmt % args}")


def main():
    import argparse
    p = argparse.ArgumentParser(description="ART Training + Inference Worker")
    p.add_argument("--port", type=int, default=8081)
    p.add_argument("--host", type=str, default="0.0.0.0")
    p.add_argument("--base-model", type=str, default="Qwen/Qwen2.5-3B-Instruct")
    args = p.parse_args()

    global _base_model
    _base_model = args.base_model

    logger.info(f"ART Worker on {args.host}:{args.port}")
    logger.info(f"Base model: {_base_model}")
    logger.info(f"Shared model for all 7 roles (1 LoRA, trained with all role data)")
    logger.info(f"Endpoints:")
    logger.info(f"  GET  /health              - Status + inference URL")
    logger.info(f"  POST /train               - Train a role's data through shared model")
    logger.info(f"  POST /v1/chat/completions - Inference (proxied to ART vLLM)")
    logger.info(f"  GET  /v1/models           - List models")

    # Initialize backend + register shared model
    logger.info("Initializing ART backend and registering shared model...")
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(_init_shared_model())
    loop.close()

    if _inference_url:
        logger.info(f"ART vLLM ready at: {_inference_url}")
    else:
        logger.warning("ART vLLM not yet available. Will initialize on first /train request.")

    server = HTTPServer((args.host, args.port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
