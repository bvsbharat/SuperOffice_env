"""
Northflank Training + Inference Server for Office OS.

Runs on a Northflank H100 GPU. Provides:
  1. vLLM inference (OpenAI-compatible /v1/chat/completions) for base or trained models
  2. Training endpoint that accepts trajectories and runs ART GRPO training

Deploy this on your Northflank H100 service, then point the simulation
at this server's URL for training + inference.

Usage on Northflank:
    pip install "openpipe-art[backend]" fastapi uvicorn httpx vllm
    python training/northflank_server.py --port 8080
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uvicorn

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# Global state
_backend = None
_models: dict[str, Any] = {}
_base_model = "Qwen/Qwen2.5-3B-Instruct"
_initialized = False
_vllm_process = None
_vllm_port = 8000  # Internal vLLM port


class TrajectoryInput(BaseModel):
    system_prompt: str
    user_message: str
    assistant_response: dict
    reward: float


class TrainRequest(BaseModel):
    role: str
    base_model: str = "Qwen/Qwen2.5-3B-Instruct"
    learning_rate: float = 1e-5
    trajectories: list[TrajectoryInput]


class TrainResponse(BaseModel):
    status: str
    role: str
    step: int = 0
    trajectories_used: int = 0
    model_name: str = ""
    metrics: dict = {}


class InferenceInfo(BaseModel):
    role: str
    model_name: str
    base_url: str
    trained: bool
    train_step: int


def _start_vllm(model: str, port: int) -> subprocess.Popen | None:
    """Start vLLM as a subprocess serving the base model."""
    try:
        cmd = [
            "python", "-m", "vllm.entrypoints.openai.api_server",
            "--model", model,
            "--port", str(port),
            "--host", "0.0.0.0",
            "--trust-remote-code",
            "--max-model-len", "4096",
            "--gpu-memory-utilization", "0.85",
            "--enable-auto-tool-choice",
            "--tool-call-parser", "hermes",
        ]
        logger.info(f"Starting vLLM: {' '.join(cmd)}")
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        # Wait for vLLM to become ready (up to 120s)
        import httpx
        for i in range(120):
            time.sleep(1)
            try:
                resp = httpx.get(f"http://localhost:{port}/health", timeout=2)
                if resp.status_code == 200:
                    logger.info(f"vLLM ready on port {port} after {i+1}s")
                    return proc
            except Exception:
                pass
            # Check if process died
            if proc.poll() is not None:
                out = proc.stdout.read().decode() if proc.stdout else ""
                logger.error(f"vLLM exited with code {proc.returncode}: {out[-500:]}")
                return None

        logger.warning("vLLM did not become ready in 120s, continuing anyway")
        return proc
    except Exception as e:
        logger.error(f"Failed to start vLLM: {e}")
        return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: launch vLLM and log GPU info."""
    global _vllm_process

    try:
        import torch
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            gpu_mem = torch.cuda.get_device_properties(0).total_mem / 1e9
            logger.info(f"GPU detected: {gpu_name} ({gpu_mem:.0f}GB)")
        else:
            logger.warning("No GPU detected! Inference and training will be slow.")
    except Exception:
        logger.warning("Could not check GPU status")

    # Start vLLM for inference
    logger.info(f"Starting vLLM with model: {_base_model}")
    _vllm_process = _start_vllm(_base_model, _vllm_port)
    if _vllm_process:
        logger.info(f"vLLM running on port {_vllm_port}, proxying /v1/* requests")
    else:
        logger.warning("vLLM not started. /v1/* endpoints will not work.")

    logger.info("Server ready.")
    yield

    # Shutdown
    if _vllm_process and _vllm_process.poll() is None:
        logger.info("Stopping vLLM...")
        _vllm_process.terminate()
        _vllm_process.wait(timeout=10)
    logger.info("Shutting down.")


app = FastAPI(title="Office OS Training + Inference Server", version="2.0.0", lifespan=lifespan)


# ── vLLM Proxy (OpenAI-compatible /v1/* endpoints) ──────────────────

async def _proxy_to_vllm(request: Request, path: str):
    """Proxy a request to the local vLLM server."""
    import httpx

    if not _vllm_process or _vllm_process.poll() is not None:
        raise HTTPException(status_code=503, detail="vLLM is not running")

    url = f"http://localhost:{_vllm_port}/v1/{path}"
    body = await request.body()
    headers = {k: v for k, v in request.headers.items()
               if k.lower() not in ("host", "content-length", "transfer-encoding")}

    async with httpx.AsyncClient(timeout=120) as client:
        # Check if streaming is requested
        is_stream = False
        if body:
            try:
                data = json.loads(body)
                is_stream = data.get("stream", False)
            except Exception:
                pass

        if is_stream:
            # Stream the response
            req = client.build_request(
                method=request.method,
                url=url,
                content=body,
                headers=headers,
            )
            resp = await client.send(req, stream=True)

            async def stream_gen():
                async for chunk in resp.aiter_bytes():
                    yield chunk
                await resp.aclose()

            return StreamingResponse(
                stream_gen(),
                status_code=resp.status_code,
                media_type=resp.headers.get("content-type", "text/event-stream"),
            )
        else:
            resp = await client.request(
                method=request.method,
                url=url,
                content=body,
                headers=headers,
            )
            return resp.json()


@app.api_route("/v1/{path:path}", methods=["GET", "POST"])
async def vllm_proxy(request: Request, path: str):
    """Proxy OpenAI-compatible requests to vLLM (chat/completions, models, etc)."""
    return await _proxy_to_vllm(request, path)


# ── ART Training Endpoints ──────────────────────────────────────────

async def _ensure_backend():
    """Lazily initialize the ART LocalBackend on first use."""
    global _backend, _initialized

    if _initialized:
        return _backend is not None

    _initialized = True

    try:
        import art
        from art.local import LocalBackend

        _backend = LocalBackend()
        logger.info("ART LocalBackend initialized on H100 GPU")
        return True

    except Exception as e:
        logger.error(f"Failed to initialize ART backend: {e}")
        logger.error("Training will not be available. Inference-only mode.")
        return False


async def _ensure_model(role: str, base_model: str | None = None):
    """Register a model for a role if not already done."""
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
    logger.info(f"Registered model for {role}: {model.name}")
    return model


@app.get("/health")
async def health():
    """Health check."""
    gpu_available = False
    gpu_name = None
    try:
        import torch
        gpu_available = torch.cuda.is_available()
        if gpu_available:
            gpu_name = torch.cuda.get_device_name(0)
    except Exception:
        pass

    vllm_running = _vllm_process is not None and _vllm_process.poll() is None

    return {
        "status": "ok",
        "gpu_available": gpu_available,
        "gpu_name": gpu_name,
        "vllm_running": vllm_running,
        "vllm_model": _base_model,
        "models_loaded": list(_models.keys()),
        "backend_ready": _backend is not None,
    }


@app.get("/models")
async def list_models():
    """List all registered models."""
    result = {}
    for role, model in _models.items():
        try:
            step = await model.get_step()
        except Exception:
            step = 0
        result[role] = {
            "name": model.name,
            "base_model": model.base_model,
            "step": step,
            "inference_url": model.inference_base_url,
        }
    return result


@app.post("/train", response_model=TrainResponse)
async def train(request: TrainRequest):
    """
    Train a role's model using provided trajectories.

    This runs GRPO training on the H100 GPU using ART's LocalBackend.
    After training, the updated LoRA adapter is loaded into vLLM automatically.
    """
    ready = await _ensure_backend()
    if not ready:
        raise HTTPException(status_code=503, detail="ART backend not available. Check GPU and openpipe-art[backend] installation.")

    import art

    role = request.role
    model = await _ensure_model(role, request.base_model)

    trajectories = []
    for t in request.trajectories:
        tool_call_content = json.dumps(t.assistant_response)
        traj = art.Trajectory(
            messages_and_choices=[
                {"role": "system", "content": t.system_prompt},
                {"role": "user", "content": t.user_message},
                {"role": "assistant", "content": None, "tool_calls": [{
                    "id": f"call_{len(trajectories)}",
                    "type": "function",
                    "function": {
                        "name": "submit_action",
                        "arguments": tool_call_content,
                    },
                }]},
            ],
            reward=t.reward,
            metadata={"role": role},
        )
        trajectories.append(traj)

    if not trajectories:
        return TrainResponse(status="skipped", role=role, trajectories_used=0)

    try:
        groups = [art.TrajectoryGroup(trajectories)]

        result = await _backend.train(
            model, groups,
            learning_rate=request.learning_rate,
        )

        await model.log(groups, metrics=result.metrics, step=result.step, split="train")

        logger.info(f"Training complete for {role}: step={result.step}, metrics={result.metrics}")

        return TrainResponse(
            status="trained",
            role=role,
            step=result.step,
            trajectories_used=len(trajectories),
            model_name=model.get_inference_name(),
            metrics=result.metrics,
        )

    except Exception as e:
        logger.error(f"Training failed for {role}: {e}")
        raise HTTPException(status_code=500, detail=f"Training failed: {e}")


@app.get("/inference/{role}", response_model=InferenceInfo)
async def inference_info(role: str):
    """Get inference endpoint info for a trained model."""
    if role not in _models:
        raise HTTPException(status_code=404, detail=f"No model registered for role: {role}")

    model = _models[role]
    try:
        step = await model.get_step()
    except Exception:
        step = 0

    return InferenceInfo(
        role=role,
        model_name=model.get_inference_name(),
        base_url=model.inference_base_url or "",
        trained=step > 0,
        train_step=step,
    )


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Office OS Training + Inference Server (Northflank H100)")
    parser.add_argument("--port", type=int, default=8080, help="Server port (default: 8080)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Server host")
    parser.add_argument("--base-model", type=str, default="Qwen/Qwen2.5-3B-Instruct",
                        help="Base model for inference and fine-tuning")
    parser.add_argument("--vllm-port", type=int, default=8000,
                        help="Internal port for vLLM (default: 8000)")
    args = parser.parse_args()

    global _base_model, _vllm_port
    _base_model = args.base_model
    _vllm_port = args.vllm_port

    logger.info(f"Starting Office OS Training + Inference Server on {args.host}:{args.port}")
    logger.info(f"Base model: {args.base_model}")
    logger.info(f"vLLM will run on internal port {args.vllm_port}")
    logger.info("Endpoints:")
    logger.info(f"  GET  /health              - Health check")
    logger.info(f"  POST /v1/chat/completions - OpenAI-compatible inference (proxied to vLLM)")
    logger.info(f"  GET  /v1/models           - List available models")
    logger.info(f"  GET  /models              - List ART-trained models")
    logger.info(f"  POST /train               - Train a role's model")
    logger.info(f"  GET  /inference/{{role}}     - Get inference endpoint for a role")

    uvicorn.run(app, host=args.host, port=args.port, loop="asyncio")


if __name__ == "__main__":
    main()
