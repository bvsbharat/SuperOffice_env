"""Remote Trainer for Office OS agents.

Sends trajectories to the Northflank H100 training worker which runs
TRL GRPO + Unsloth. Trained LoRA adapters are hot-loaded into vLLM.

Architecture:
  - TrajectoryCollector captures agent turns during simulation
  - Every N simulation days, RemoteTrainer sends trajectories to the H100
  - Training worker runs GRPO, saves LoRA, hot-loads into vLLM
  - Agents use vLLM for inference (base model or LoRA-adapted)
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from .collector import TrajectoryCollector, TurnRecord

logger = logging.getLogger(__name__)


class RemoteTrainer:
    """
    Sends trajectories to the Northflank training worker for GRPO training.

    Training happens after each full episode using trajectories
    collected by the TrajectoryCollector. Each role gets its own LoRA adapter.

    Usage:
        trainer = RemoteTrainer(
            collector=collector,
            base_model="Qwen/Qwen2.5-14B-Instruct",
        )
        if trainer.should_train(current_day):
            await trainer.train_all_roles()
        endpoint = trainer.get_inference_endpoint(role)
    """

    def __init__(
        self,
        collector: TrajectoryCollector,
        base_model: str = "Qwen/Qwen2.5-14B-Instruct",
        train_every_days: int = 999,  # Train after episode, not mid-episode
        min_trajectories: int = 10,
        northflank_endpoint: str = "",
        learning_rate: float = 2e-5,
    ):
        self.collector = collector
        self.base_model = base_model
        self.train_every_days = train_every_days
        self.min_trajectories = min_trajectories
        self.northflank_endpoint = northflank_endpoint or os.environ.get("NORTHFLANK_INFERENCE_ENDPOINT", "")
        self.learning_rate = learning_rate

        self._initialized = False
        self._last_train_day = 0
        self._train_step: dict[str, int] = {}
        self._inference_endpoints: dict[str, dict] = {}

    @property
    def enabled(self) -> bool:
        return bool(self.northflank_endpoint)

    def should_train(self, current_day: int) -> bool:
        """Check if it's time to train (every N simulation days)."""
        if not self.enabled:
            return False
        if current_day - self._last_train_day < self.train_every_days:
            return False
        pending = self.collector.pending_count()
        ready = pending >= self.min_trajectories
        if ready:
            logger.info(f"Training check: day={current_day}, pending={pending}, threshold={self.min_trajectories} -> TRAIN")
        return ready

    async def initialize(self):
        """Initialize the remote trainer."""
        if self._initialized:
            return
        train_endpoint = os.environ.get("NORTHFLANK_TRAIN_ENDPOINT", "")
        logger.info(f"Remote trainer: inference={self.northflank_endpoint}, training={train_endpoint}")
        self._initialized = True

    async def train_role(self, role: str) -> dict:
        """Train a single role by sending trajectories to the remote worker."""
        batch = self.collector.drain_batch(role)
        turns = batch.get(role, [])
        logger.info(f"train_role({role}): {len(turns)} pending turns")
        if len(turns) < 1:
            return {"status": "skipped", "role": role, "reason": "no pending turns"}

        train_endpoint = os.environ.get("NORTHFLANK_TRAIN_ENDPOINT", "")
        if not train_endpoint and self.northflank_endpoint:
            train_endpoint = self.northflank_endpoint
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
                resp = await client.post(train_url, json=payload)
                resp.raise_for_status()
                result = resp.json()

            self._train_step[role] = result.get("step", self._train_step.get(role, 0) + 1)
            self._inference_endpoints[role] = {
                "base_url": self.northflank_endpoint,
                "model_name": result.get("model_name", f"office-os-{role}"),
            }

            logger.info(f"Remote training complete for {role}: {result}")
            return {"status": "trained", "role": role, **result}

        except Exception as e:
            logger.warning(f"Remote training failed for {role}: {e}")
            return {"status": "error", "role": role, "error": str(e)}

    async def train_all_roles(self, current_day: int = 0) -> list[dict]:
        """Train all roles that have pending data."""
        if not self._initialized:
            await self.initialize()

        self._last_train_day = current_day
        results = []

        from market.config import AGENT_ROLES
        for role in AGENT_ROLES:
            result = await self.train_role(role)
            results.append(result)

        trained = [r for r in results if r["status"] == "trained"]
        logger.info(f"Training round complete: {len(trained)}/{len(results)} roles trained")

        # Save training data for offline analysis
        data_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "training_data",
            f"trajectories_day_{current_day}.jsonl",
        )
        self.collector.save_jsonl(data_path)

        return results

    def get_inference_endpoint(self, role: str) -> dict | None:
        """Get the inference endpoint for a trained model."""
        if self.northflank_endpoint and self.is_role_trained(role):
            return {
                "base_url": self.northflank_endpoint,
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
