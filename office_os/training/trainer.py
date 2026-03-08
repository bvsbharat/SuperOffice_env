"""ART Trainer for Office OS agents.

Trains custom models using OpenPipe ART (Agent Reinforcement Trainer) with GRPO.
Models are trained on Northflank H100 GPUs and served via vLLM.

Architecture:
  - TrajectoryCollector captures agent turns during simulation
  - Every N simulation days, ARTTrainer trains each role's model on the H100
  - Trained models are served via vLLM on Northflank with LoRA adapters
  - LLMAgent switches from Claude to the fine-tuned model after training

Deployment modes:
  1. "local" — Run ART LocalBackend on the Northflank H100 (recommended for hackathon)
  2. "serverless" — Use W&B managed GPUs via ServerlessBackend
  3. "remote" — Connect to Northflank training API (for split client/server architecture)
  4. "disabled" — Just collect trajectories for offline training
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Any

from .collector import TrajectoryCollector, TurnRecord

logger = logging.getLogger(__name__)


class ARTTrainer:
    """
    Manages ART training for all Office OS agent roles.

    Training happens every `train_every_days` simulation days using trajectories
    collected by the TrajectoryCollector. Each role gets its own LoRA adapter.

    Usage:
        trainer = ARTTrainer(
            collector=collector,
            base_model="Qwen/Qwen2.5-3B-Instruct",
            train_every_days=3,
            backend_type="local",  # Run on Northflank H100
        )
        # In the simulation loop:
        if trainer.should_train(current_day):
            await trainer.train_all_roles()
        # Get the model endpoint for a role:
        endpoint = trainer.get_inference_endpoint(role)
    """

    def __init__(
        self,
        collector: TrajectoryCollector,
        base_model: str = "Qwen/Qwen2.5-3B-Instruct",
        train_every_days: int = 3,
        min_trajectories_per_role: int = 10,
        backend_type: str = "local",  # "local" (H100), "serverless" (W&B), "remote", "disabled"
        northflank_endpoint: str | None = None,
        northflank_api_key: str | None = None,
        project_name: str = "office-os",
        learning_rate: float = 1e-5,
    ):
        self.collector = collector
        self.base_model = base_model
        self.train_every_days = train_every_days
        self.min_trajectories = min_trajectories_per_role
        self.backend_type = backend_type
        self.northflank_endpoint = northflank_endpoint or os.environ.get("NORTHFLANK_INFERENCE_ENDPOINT", "")
        self.northflank_api_key = northflank_api_key or os.environ.get("NORTHFLANK_API_KEY", "")
        self.project_name = project_name
        self.learning_rate = learning_rate

        self._models: dict[str, Any] = {}  # role -> art.TrainableModel
        self._backend = None
        self._initialized = False
        self._last_train_day = 0
        self._train_step: dict[str, int] = {}  # role -> training step count
        self._inference_endpoints: dict[str, dict] = {}  # role -> {base_url, api_key, model_name}

    @property
    def enabled(self) -> bool:
        return self.backend_type != "disabled"

    def should_train(self, current_day: int) -> bool:
        """Check if it's time to train (every N simulation days)."""
        if not self.enabled:
            return False
        if current_day - self._last_train_day < self.train_every_days:
            return False
        return self.collector.pending_count() >= self.min_trajectories

    async def initialize(self):
        """Initialize the ART backend and register models for each role."""
        if self._initialized or not self.enabled:
            return

        try:
            import art
        except ImportError:
            logger.warning("openpipe-art not installed. Training disabled. Install with: pip install openpipe-art")
            self.backend_type = "disabled"
            return

        try:
            if self.backend_type == "local":
                # LocalBackend: runs vLLM + training on the same GPU (Northflank H100)
                from art.local import LocalBackend
                self._backend = LocalBackend()
                logger.info("Using ART LocalBackend (Northflank H100 GPU)")
            elif self.backend_type == "serverless":
                from art.serverless.backend import ServerlessBackend
                self._backend = ServerlessBackend()
                logger.info("Using ART ServerlessBackend (W&B managed GPUs)")
            elif self.backend_type == "remote":
                # Remote: connect to a Northflank-hosted training API
                logger.info(f"Using remote training endpoint: {self.northflank_endpoint}")
                self._initialized = True
                return
            else:
                logger.info("ART training disabled")
                return

            # Create a trainable model per role
            from market.config import AGENT_ROLES
            for role in AGENT_ROLES:
                model = art.TrainableModel(
                    name=f"office-os-{role}-{datetime.now().strftime('%Y%m%d')}",
                    project=self.project_name,
                    base_model=self.base_model,
                )
                await model.register(self._backend)
                self._models[role] = model
                self._train_step[role] = 0
                logger.info(f"Registered ART model for {role}: {model.name}")

            self._initialized = True
            logger.info(f"ART trainer initialized: backend={self.backend_type}, base_model={self.base_model}")

        except Exception as e:
            logger.warning(f"ART initialization failed: {e}. Training disabled.")
            self.backend_type = "disabled"

    async def train_role(self, role: str) -> dict:
        """Train a single role's model using collected trajectories."""
        if not self._initialized:
            return {"status": "skipped", "role": role, "reason": "not initialized"}

        batch = self.collector.drain_batch(role)
        turns = batch.get(role, [])
        if len(turns) < self.min_trajectories:
            return {"status": "skipped", "role": role, "reason": f"only {len(turns)} turns (need {self.min_trajectories})"}

        # Remote training mode: send to Northflank API
        if self.backend_type == "remote":
            return await self._train_remote(role, turns)

        # Local/Serverless: use ART backend directly
        if role not in self._models:
            return {"status": "skipped", "role": role, "reason": "no model registered"}

        import art
        model = self._models[role]

        try:
            trajectories = self.collector.to_art_trajectories(role, turns)
            groups = [art.TrajectoryGroup(trajectories)]

            result = await self._backend.train(
                model, groups,
                learning_rate=self.learning_rate,
            )

            await model.log(groups, metrics=result.metrics, step=result.step, split="train")
            self._train_step[role] = result.step

            # Update inference endpoint
            self._inference_endpoints[role] = {
                "base_url": model.inference_base_url,
                "api_key": model.inference_api_key,
                "model_name": model.get_inference_name(),
            }

            logger.info(
                f"Trained {role} model on H100: step={result.step}, "
                f"trajectories={len(trajectories)}, metrics={result.metrics}"
            )
            return {
                "status": "trained",
                "role": role,
                "step": result.step,
                "trajectories": len(trajectories),
                "metrics": result.metrics,
            }

        except Exception as e:
            logger.warning(f"Training failed for {role}: {e}")
            return {"status": "error", "role": role, "error": str(e)}

    async def _train_remote(self, role: str, turns: list[TurnRecord]) -> dict:
        """Send trajectories to Northflank training worker for remote training."""
        # Training worker runs on a separate port (default: 8081)
        train_endpoint = os.environ.get("NORTHFLANK_TRAIN_ENDPOINT", "")
        if not train_endpoint and self.northflank_endpoint:
            # Derive training port: replace inference port with 8081
            base = self.northflank_endpoint.rstrip("/")
            train_endpoint = base  # Will hit /train on same endpoint if no separate one
        if not train_endpoint:
            return {"status": "skipped", "role": role, "reason": "no training endpoint configured"}

        try:
            import httpx

            train_url = f"{train_endpoint.rstrip('/')}/train"
            payload = {
                "role": role,
                "base_model": self.base_model,
                "learning_rate": self.learning_rate,
                "trajectories": [
                    {
                        "system_prompt": t.system_prompt,
                        "user_message": t.user_message,
                        "assistant_response": t.assistant_response,
                        "reward": t.reward,
                    }
                    for t in turns
                ],
            }

            async with httpx.AsyncClient(timeout=600) as client:
                headers = {}
                if self.northflank_api_key:
                    headers["Authorization"] = f"Bearer {self.northflank_api_key}"
                resp = await client.post(train_url, json=payload, headers=headers)
                resp.raise_for_status()
                result = resp.json()

            self._train_step[role] = result.get("step", self._train_step.get(role, 0) + 1)
            self._inference_endpoints[role] = {
                "base_url": self.northflank_endpoint,
                "api_key": self.northflank_api_key,
                "model_name": result.get("model_name", f"office-os-{role}"),
            }

            logger.info(f"Remote training complete for {role}: {result}")
            return {"status": "trained", "role": role, **result}

        except Exception as e:
            logger.warning(f"Remote training failed for {role}: {e}")
            return {"status": "error", "role": role, "error": str(e)}

    async def train_all_roles(self, current_day: int = 0) -> list[dict]:
        """Train all roles that have enough data."""
        if not self._initialized:
            await self.initialize()
        if not self._initialized and self.backend_type != "remote":
            return []

        self._last_train_day = current_day
        results = []

        from market.config import AGENT_ROLES
        for role in AGENT_ROLES:
            result = await self.train_role(role)
            results.append(result)

        trained = [r for r in results if r["status"] == "trained"]
        logger.info(f"Training round complete on H100: {len(trained)}/{len(results)} roles trained")

        # Save training data for offline analysis
        data_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "training_data",
            f"trajectories_day_{current_day}.jsonl",
        )
        self.collector.save_jsonl(data_path)

        return results

    def get_inference_endpoint(self, role: str) -> dict | None:
        """
        Get the inference endpoint for a trained model.
        Returns {base_url, api_key, model_name} or None if not yet trained.
        """
        # If Northflank endpoint is set and model is trained, use it
        if self.northflank_endpoint and self.is_role_trained(role):
            return {
                "base_url": self.northflank_endpoint,
                "api_key": self.northflank_api_key,
                "model_name": f"office-os-{role}",
            }
        return self._inference_endpoints.get(role)

    def is_role_trained(self, role: str) -> bool:
        """Check if a role has been trained at least once."""
        return self._train_step.get(role, 0) > 0

    def get_training_stats(self) -> dict:
        """Get training statistics for all roles."""
        from market.config import AGENT_ROLES
        return {
            "enabled": self.enabled,
            "initialized": self._initialized,
            "backend": self.backend_type,
            "base_model": self.base_model,
            "last_train_day": self._last_train_day,
            "total_trajectories": self.collector.total_count(),
            "pending_trajectories": self.collector.pending_count(),
            "roles": {
                role: {
                    "train_step": self._train_step.get(role, 0),
                    "total_turns": len(self.collector.turns_for_role(role)),
                    "has_endpoint": role in self._inference_endpoints,
                }
                for role in AGENT_ROLES
            },
        }
