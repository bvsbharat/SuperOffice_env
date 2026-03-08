"""
ART Training + Inference Worker for Office OS on Northflank H100.

Uses OpenPipe ART LocalBackend which manages its own internal vLLM.
One process handles everything: inference AND training.

After training, LoRA adapters are automatically loaded — no restart needed.

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
_inference_url: str = ""
_lock = threading.Lock()


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


async def _register_model(role: str, base_model: str | None = None):
    """Register a trainable model for a role. ART starts vLLM on first register."""
    global _inference_url
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

    # Capture ART's internal vLLM URL
    if hasattr(model, 'inference_base_url') and model.inference_base_url:
        _inference_url = model.inference_base_url
        logger.info(f"ART vLLM inference URL: {_inference_url}")

    logger.info(f"Registered model for {role}: {model.name}")
    return model


async def _init_all_models():
    """Register models for all roles on startup so vLLM is ready."""
    if not _init_backend():
        return

    roles = ["ceo", "dev", "marketing", "sales", "content", "hr", "customer"]
    for role in roles:
        try:
            await _register_model(role, _base_model)
        except Exception as e:
            logger.error(f"Failed to register model for {role}: {e}")


async def _train_role(role: str, base_model: str, learning_rate: float, trajectories_data: list) -> dict:
    """Train a single role with GRPO via ART. LoRA auto-loaded into vLLM."""
    if _backend is None:
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

        # Get updated model name (includes LoRA) for inference
        inference_name = model.get_inference_name()

        logger.info(f"Trained {role}: step={result.step}, trajs={len(trajectories)}, model={inference_name}")
        return {
            "status": "trained",
            "role": role,
            "step": result.step,
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
                "inference_url": _inference_url,
                "models": list(_models.keys()),
                "train_steps": _train_steps,
                "base_model": _base_model,
            })
        elif self.path == "/models":
            self._json(200, {
                "models": {r: {"step": s} for r, s in _train_steps.items()},
                "base_model": _base_model,
                "inference_url": _inference_url,
            })
        elif self.path.startswith("/v1/"):
            # Proxy to ART's internal vLLM
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
            # Proxy to ART's internal vLLM
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
    p.add_argument("--base-model", type=str, default="Qwen/Qwen3-8B")
    args = p.parse_args()

    global _base_model
    _base_model = args.base_model

    logger.info(f"ART Worker on {args.host}:{args.port}")
    logger.info(f"Base model: {_base_model}")
    logger.info(f"ART manages vLLM internally (training + inference)")
    logger.info(f"Endpoints:")
    logger.info(f"  GET  /health              - Status + inference URL")
    logger.info(f"  POST /train               - Train a role with GRPO")
    logger.info(f"  POST /v1/chat/completions - Inference (proxied to ART vLLM)")
    logger.info(f"  GET  /v1/models           - List models")

    # Initialize backend + register all role models on startup
    logger.info("Initializing ART backend and registering models...")
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(_init_all_models())
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
