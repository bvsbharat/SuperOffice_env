"""
Northflank Training + Inference Server for Office OS.

Runs on a Northflank H100 GPU. Provides:
  1. Training endpoint that accepts trajectories and runs ART GRPO training
  2. vLLM inference endpoint (OpenAI-compatible) for trained models

Deploy this on your Northflank H100 service, then point the simulation
at this server's URL for training + inference.

Usage on Northflank:
    pip install "openpipe-art[backend]" fastapi uvicorn
    python training/northflank_server.py --port 8080
"""

from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# Global state — initialized lazily on first /train request
_backend = None
_models: dict[str, Any] = {}
_base_model = "Qwen/Qwen2.5-3B-Instruct"
_initialized = False


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: just log GPU info. ART backend is initialized lazily."""
    try:
        import torch
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            gpu_mem = torch.cuda.get_device_properties(0).total_mem / 1e9
            logger.info(f"GPU detected: {gpu_name} ({gpu_mem:.0f}GB)")
        else:
            logger.warning("No GPU detected! Training will be slow.")
    except Exception:
        logger.warning("Could not check GPU status")

    logger.info(f"Server ready. ART backend will initialize on first /train request.")
    yield
    logger.info("Shutting down.")


app = FastAPI(title="Office OS ART Training Server", version="1.0.0", lifespan=lifespan)


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

    return {
        "status": "ok",
        "gpu_available": gpu_available,
        "gpu_name": gpu_name,
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
    # Initialize backend on first call
    ready = await _ensure_backend()
    if not ready:
        raise HTTPException(status_code=503, detail="ART backend not available. Check GPU and openpipe-art[backend] installation.")

    import art

    role = request.role

    # Register model if needed
    model = await _ensure_model(role, request.base_model)

    # Convert request trajectories to ART format
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
    parser = argparse.ArgumentParser(description="Office OS ART Training Server (Northflank H100)")
    parser.add_argument("--port", type=int, default=8080, help="Server port (default: 8080)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Server host")
    parser.add_argument("--base-model", type=str, default="Qwen/Qwen2.5-3B-Instruct",
                        help="Base model for fine-tuning")
    args = parser.parse_args()

    global _base_model
    _base_model = args.base_model

    logger.info(f"Starting Office OS ART Training Server on {args.host}:{args.port}")
    logger.info(f"Base model: {args.base_model}")
    logger.info("Endpoints:")
    logger.info(f"  GET  /health          - Health check")
    logger.info(f"  GET  /models          - List models")
    logger.info(f"  POST /train           - Train a role's model")
    logger.info(f"  GET  /inference/{{role}} - Get inference endpoint for a role")

    # Use --loop uvloop=False to avoid conflict with ART
    uvicorn.run(app, host=args.host, port=args.port, loop="asyncio")


if __name__ == "__main__":
    main()
