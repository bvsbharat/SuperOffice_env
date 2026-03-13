"""
Mac-local LoRA training worker using MLX for Apple Silicon.

Replaces the Northflank/H100 remote training pipeline with a local
MLX-based GRPO training loop that runs on Apple M-series chips.

Requirements:
    pip install mlx-lm mlx

Usage:
    # As a standalone training server (replaces Northflank train worker):
    python mac_trainer.py --port 8090

    # Or imported directly for in-process training:
    from training.mac_trainer import MacTrainer
    trainer = MacTrainer()
    result = trainer.train_role("dev", trajectories)

Architecture:
    1. Receives trajectories from the simulation (same format as RemoteTrainer)
    2. Converts to preference pairs using reward signal (GRPO-style)
    3. Runs LoRA fine-tuning via mlx-lm
    4. Saves adapter weights for Ollama model creation or direct loading
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Default base model — must match the Ollama model being used for inference
DEFAULT_BASE_MODEL = "Qwen/Qwen3.5-0.8B"
DEFAULT_ADAPTER_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "training_data",
    "adapters",
)


@dataclass
class TrainingConfig:
    """Configuration for MLX LoRA training."""
    base_model: str = DEFAULT_BASE_MODEL
    adapter_dir: str = DEFAULT_ADAPTER_DIR
    learning_rate: float = 2e-5
    num_epochs: int = 1
    batch_size: int = 2
    lora_rank: int = 8
    lora_alpha: int = 16
    lora_dropout: float = 0.05
    max_seq_length: int = 2048
    grad_accumulation_steps: int = 4
    warmup_steps: int = 10
    save_every: int = 50


@dataclass
class TrajectoryPair:
    """A preference pair for GRPO-style training."""
    prompt: str  # system + user message
    chosen: str  # high-reward response
    rejected: str  # low-reward response
    chosen_reward: float = 0.0
    rejected_reward: float = 0.0


class MacTrainer:
    """
    Local LoRA trainer for Apple Silicon using MLX.

    Converts simulation trajectories into preference pairs and runs
    LoRA fine-tuning. Compatible with the RemoteTrainer interface
    so it can be swapped in without changing the training loop.
    """

    def __init__(self, config: TrainingConfig | None = None):
        self.config = config or TrainingConfig()
        self._train_step: dict[str, int] = {}
        self._adapter_paths: dict[str, str] = {}
        os.makedirs(self.config.adapter_dir, exist_ok=True)

        # Check MLX availability
        self._mlx_available = self._check_mlx()

    def _check_mlx(self) -> bool:
        """Check if MLX and mlx-lm are available."""
        try:
            import mlx
            import mlx.core
            logger.info(f"MLX available: {mlx.core.default_device()}")
            return True
        except ImportError:
            logger.warning(
                "MLX not available. Install with: pip install mlx mlx-lm\n"
                "MLX requires Apple Silicon (M1/M2/M3/M4)."
            )
            return False

    def _trajectories_to_pairs(
        self, trajectories: list[dict], role: str
    ) -> list[TrajectoryPair]:
        """Convert raw trajectories into preference pairs for training.

        GRPO approach: group trajectories by similar states, pick highest
        reward as 'chosen' and lowest as 'rejected'.

        Falls back to reward threshold: above median = chosen, below = rejected.
        """
        if len(trajectories) < 2:
            return []

        # Sort by reward
        sorted_trajs = sorted(trajectories, key=lambda t: t.get("reward", 0))

        # Split into bottom half (rejected) and top half (chosen)
        mid = len(sorted_trajs) // 2
        rejected_pool = sorted_trajs[:mid]
        chosen_pool = sorted_trajs[mid:]

        pairs = []
        for chosen, rejected in zip(chosen_pool, rejected_pool):
            # Build prompt from system + user message
            sys_prompt = chosen.get("system_prompt", "")
            user_msg = chosen.get("user_message", "")
            prompt = f"{sys_prompt}\n\n{user_msg}" if sys_prompt else user_msg

            # Format responses as JSON (matching agent output format)
            chosen_resp = chosen.get("assistant_response", {})
            rejected_resp = rejected.get("assistant_response", {})

            if isinstance(chosen_resp, dict):
                chosen_text = json.dumps(chosen_resp, indent=None)
            else:
                chosen_text = str(chosen_resp)

            if isinstance(rejected_resp, dict):
                rejected_text = json.dumps(rejected_resp, indent=None)
            else:
                rejected_text = str(rejected_resp)

            pairs.append(TrajectoryPair(
                prompt=prompt,
                chosen=chosen_text,
                rejected=rejected_text,
                chosen_reward=chosen.get("reward", 0),
                rejected_reward=rejected.get("reward", 0),
            ))

        return pairs

    def _prepare_sft_data(self, trajectories: list[dict], role: str) -> list[dict]:
        """Convert trajectories to SFT format (supervised fine-tuning).

        Simpler than GRPO — just train on high-reward examples.
        Used as fallback when there aren't enough trajectories for preference pairs.
        """
        # Filter to positive-reward trajectories
        good_trajs = [t for t in trajectories if t.get("reward", 0) > 0]
        if not good_trajs:
            # If no positive, take the top 50% by reward
            sorted_trajs = sorted(trajectories, key=lambda t: t.get("reward", 0), reverse=True)
            good_trajs = sorted_trajs[:max(1, len(sorted_trajs) // 2)]

        sft_data = []
        for t in good_trajs:
            sys_prompt = t.get("system_prompt", "")
            user_msg = t.get("user_message", "")
            resp = t.get("assistant_response", {})

            if isinstance(resp, dict):
                resp_text = json.dumps(resp, indent=None)
            else:
                resp_text = str(resp)

            sft_data.append({
                "messages": [
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": user_msg},
                    {"role": "assistant", "content": resp_text},
                ]
            })

        return sft_data

    def train_role(self, role: str, trajectories: list[dict]) -> dict:
        """Train a LoRA adapter for a single role using MLX.

        Args:
            role: Agent role (e.g., "dev", "sales")
            trajectories: List of trajectory dicts with keys:
                system_prompt, user_message, assistant_response, reward

        Returns:
            Training result dict with status, adapter_path, etc.
        """
        if not self._mlx_available:
            return self._train_fallback(role, trajectories)

        if len(trajectories) < 2:
            return {"status": "skipped", "role": role, "reason": "not enough trajectories"}

        try:
            return self._train_with_mlx(role, trajectories)
        except Exception as e:
            logger.error(f"MLX training failed for {role}: {e}")
            return {"status": "error", "role": role, "error": str(e)}

    def _train_with_mlx(self, role: str, trajectories: list[dict]) -> dict:
        """Run LoRA training using mlx-lm."""
        from mlx_lm import load as mlx_load
        from mlx_lm import generate as mlx_generate
        import mlx.core as mx
        import mlx.nn as nn
        import mlx.optimizers as optim

        logger.info(f"Training {role} with MLX: {len(trajectories)} trajectories")

        # Prepare SFT data (simpler and more reliable than DPO for small datasets)
        sft_data = self._prepare_sft_data(trajectories, role)
        if not sft_data:
            return {"status": "skipped", "role": role, "reason": "no usable training data"}

        # Write training data to temp file
        data_dir = tempfile.mkdtemp(prefix=f"office_os_train_{role}_")
        train_file = os.path.join(data_dir, "train.jsonl")
        with open(train_file, "w") as f:
            for item in sft_data:
                f.write(json.dumps(item) + "\n")

        # Adapter output path
        adapter_dir = os.path.join(self.config.adapter_dir, role)
        os.makedirs(adapter_dir, exist_ok=True)

        try:
            # Use mlx-lm's built-in LoRA training
            from mlx_lm import lora as mlx_lora

            # Write LoRA config
            lora_config = {
                "model": self.config.base_model,
                "data": data_dir,
                "train": True,
                "adapter_path": adapter_dir,
                "iters": min(len(sft_data) * self.config.num_epochs, 100),
                "batch_size": min(self.config.batch_size, len(sft_data)),
                "learning_rate": self.config.learning_rate,
                "lora_layers": self.config.lora_rank,
                "save_every": self.config.save_every,
            }

            # Run training via mlx-lm CLI-compatible interface
            import subprocess
            cmd = [
                "python", "-m", "mlx_lm.lora",
                "--model", self.config.base_model,
                "--data", data_dir,
                "--train",
                "--adapter-path", adapter_dir,
                "--iters", str(lora_config["iters"]),
                "--batch-size", str(lora_config["batch_size"]),
                "--learning-rate", str(self.config.learning_rate),
                "--lora-layers", str(self.config.lora_rank),
            ]

            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=600
            )

            if result.returncode != 0:
                logger.error(f"mlx-lm lora training failed: {result.stderr}")
                return {"status": "error", "role": role, "error": result.stderr[:500]}

            step = self._train_step.get(role, 0) + 1
            self._train_step[role] = step
            self._adapter_paths[role] = adapter_dir

            logger.info(f"Training complete for {role}: adapter saved to {adapter_dir}")

            return {
                "status": "trained",
                "role": role,
                "step": step,
                "adapter_path": adapter_dir,
                "trajectories_used": len(sft_data),
                "model_name": f"office-os-{role}",
            }

        finally:
            # Cleanup temp data
            shutil.rmtree(data_dir, ignore_errors=True)

    def _train_fallback(self, role: str, trajectories: list[dict]) -> dict:
        """Fallback when MLX is not available: save trajectories for later training.

        Writes the SFT-formatted data to disk so it can be trained later
        (on a machine with MLX, or uploaded to a GPU instance).
        """
        sft_data = self._prepare_sft_data(trajectories, role)
        if not sft_data:
            return {"status": "skipped", "role": role, "reason": "no usable training data"}

        # Save for later
        fallback_dir = os.path.join(self.config.adapter_dir, "pending_training")
        os.makedirs(fallback_dir, exist_ok=True)
        output_path = os.path.join(fallback_dir, f"{role}_sft_data.jsonl")

        with open(output_path, "a") as f:
            for item in sft_data:
                f.write(json.dumps(item) + "\n")

        logger.info(f"Saved {len(sft_data)} SFT examples for {role} to {output_path}")
        return {
            "status": "saved",
            "role": role,
            "output_path": output_path,
            "trajectories_saved": len(sft_data),
            "reason": "MLX not available — data saved for later training",
        }

    def create_ollama_model(self, role: str) -> dict:
        """Create an Ollama model with the trained LoRA adapter.

        Uses `ollama create` to build a new model variant that includes
        the LoRA weights. This allows serving the fine-tuned model
        through the same Ollama inference pipeline.

        Requires: adapter saved as GGUF-compatible format.
        """
        adapter_dir = self._adapter_paths.get(role)
        if not adapter_dir:
            return {"status": "error", "role": role, "error": "no adapter found"}

        model_name = f"office-os-{role}"

        # Create Modelfile for Ollama
        modelfile_content = f"""FROM qwen3.5:0.8b
ADAPTER {adapter_dir}
SYSTEM "You are a {role} agent in Office OS, a multi-agent startup simulation."
"""
        modelfile_path = os.path.join(adapter_dir, "Modelfile")
        with open(modelfile_path, "w") as f:
            f.write(modelfile_content)

        try:
            import subprocess
            result = subprocess.run(
                ["ollama", "create", model_name, "-f", modelfile_path],
                capture_output=True, text=True, timeout=300,
            )
            if result.returncode == 0:
                logger.info(f"Created Ollama model: {model_name}")
                return {"status": "created", "model_name": model_name}
            else:
                return {"status": "error", "error": result.stderr[:500]}
        except FileNotFoundError:
            return {"status": "error", "error": "ollama CLI not found"}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def get_adapter_path(self, role: str) -> str | None:
        """Get the path to a trained adapter for a role."""
        return self._adapter_paths.get(role)

    def is_role_trained(self, role: str) -> bool:
        """Check if a role has been trained."""
        return self._train_step.get(role, 0) > 0

    def get_training_stats(self) -> dict:
        """Get training statistics."""
        return {
            "mlx_available": self._mlx_available,
            "base_model": self.config.base_model,
            "adapter_dir": self.config.adapter_dir,
            "roles_trained": {
                role: {
                    "steps": steps,
                    "adapter_path": self._adapter_paths.get(role, ""),
                }
                for role, steps in self._train_step.items()
            },
        }


class MacLocalTrainer:
    """Drop-in replacement for RemoteTrainer that trains locally on Mac.

    Same interface as RemoteTrainer but uses MacTrainer + MLX instead of
    sending trajectories to Northflank.
    """

    def __init__(
        self,
        collector,
        base_model: str = DEFAULT_BASE_MODEL,
        train_every_days: int = 15,
        min_trajectories: int = 10,
        learning_rate: float = 2e-5,
        **kwargs,  # Accept and ignore northflank_endpoint etc.
    ):
        self.collector = collector
        self.train_every_days = train_every_days
        self.min_trajectories = min_trajectories
        self._last_train_day = 0
        self._mac_trainer = MacTrainer(TrainingConfig(
            base_model=base_model,
            learning_rate=learning_rate,
        ))

    @property
    def enabled(self) -> bool:
        return True  # Always enabled for local training

    def should_train(self, current_day: int) -> bool:
        if current_day - self._last_train_day < self.train_every_days:
            return False
        return self.collector.pending_count() >= self.min_trajectories

    async def train_all_roles(self, current_day: int = 0) -> list[dict]:
        self._last_train_day = current_day
        results = []

        from market.config import AGENT_ROLES
        for role in AGENT_ROLES:
            batch = self.collector.drain_batch(role)
            turns = batch.get(role, [])
            if not turns:
                results.append({"status": "skipped", "role": role, "reason": "no pending turns"})
                continue

            trajectories = [
                {
                    "system_prompt": t.system_prompt,
                    "user_message": t.user_message,
                    "assistant_response": t.assistant_response,
                    "reward": t.reward,
                    "reward_breakdown": t.reward_breakdown,
                }
                for t in turns
            ]
            result = self._mac_trainer.train_role(role, trajectories)
            results.append(result)

        return results

    def get_inference_endpoint(self, role: str) -> dict | None:
        """For Mac local, there's no separate endpoint — adapter is loaded directly."""
        return None

    def is_role_trained(self, role: str) -> bool:
        return self._mac_trainer.is_role_trained(role)

    def get_training_stats(self) -> dict:
        return self._mac_trainer.get_training_stats()


# ── Standalone server mode ─────────────────────────────────────────

def main():
    """Run as a standalone training server (replaces Northflank train worker)."""
    import argparse
    parser = argparse.ArgumentParser(description="Mac-local MLX training server")
    parser.add_argument("--port", type=int, default=8090)
    parser.add_argument("--host", type=str, default="0.0.0.0")
    parser.add_argument("--base-model", type=str, default=DEFAULT_BASE_MODEL)
    args = parser.parse_args()

    from fastapi import FastAPI
    import uvicorn

    app = FastAPI(title="Office OS Mac Training Worker")
    trainer = MacTrainer(TrainingConfig(base_model=args.base_model))

    @app.post("/train")
    async def train(payload: dict):
        role = payload["role"]
        trajectories = payload["trajectories"]
        result = trainer.train_role(role, trajectories)
        return result

    @app.get("/status")
    async def status():
        return trainer.get_training_stats()

    @app.post("/create-ollama-model")
    async def create_model(payload: dict):
        role = payload["role"]
        return trainer.create_ollama_model(role)

    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
