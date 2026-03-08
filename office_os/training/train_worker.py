"""
TRL GRPO Training Worker for Office OS on Northflank H100.

Replaces ART with direct TRL + Unsloth for training.
vLLM runs separately on port 8080 for inference.

Architecture:
  - vLLM standalone on port 8080 (inference, LoRA hot-swap)
  - This worker on port 8081 (accepts trajectories, runs GRPO, hot-loads LoRA)
  - Unsloth for memory-efficient 4-bit QLoRA training
  - After training, LoRA adapter is saved and hot-loaded into vLLM

Usage:
    # Terminal 1: vLLM inference
    VLLM_ALLOW_RUNTIME_LORA_UPDATING=True python -m vllm.entrypoints.openai.api_server \\
        --model Qwen/Qwen2.5-3B-Instruct --port 8080 --host 0.0.0.0 \\
        --enable-lora --max-loras 2 --max-lora-rank 64 \\
        --gpu-memory-utilization 0.4 --max-model-len 4096 --enforce-eager

    # Terminal 2: Training worker
    python training/train_worker.py --port 8081 --base-model Qwen/Qwen2.5-3B-Instruct
"""

from __future__ import annotations

import json
import logging
import os
import sys
import gc
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Any

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

_base_model = "Qwen/Qwen2.5-3B-Instruct"
_train_steps: dict[str, int] = {}
_global_step: int = 0
_lock = threading.Lock()
_vllm_url = "http://localhost:8080"  # vLLM inference server
_lora_output_dir = "/tmp/office_os_lora"

ALL_ROLES = ["ceo", "dev", "marketing", "sales", "content", "hr", "customer"]

# Initialize step counters
for role in ALL_ROLES:
    _train_steps[role] = 0


def _train_grpo(role: str, trajectories_data: list, learning_rate: float = 2e-5) -> dict:
    """Train with TRL GRPO using Unsloth. Saves LoRA and hot-loads into vLLM."""
    global _global_step
    import torch

    if not trajectories_data:
        return {"status": "skipped", "role": role, "trajectories_used": 0}

    try:
        from unsloth import FastLanguageModel
        from trl import GRPOConfig, GRPOTrainer
        from datasets import Dataset

        logger.info(f"Loading model for {role} training...")

        # Load model with Unsloth 4-bit quantization
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=_base_model,
            max_seq_length=1024,
            load_in_4bit=True,
        )

        model = FastLanguageModel.get_peft_model(
            model,
            r=64,
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                            "gate_proj", "up_proj", "down_proj"],
            lora_alpha=64,
            use_gradient_checkpointing="unsloth",
            random_state=3407,
        )

        # Build dataset from trajectories
        # Each trajectory has: system_prompt, user_message, assistant_response, reward
        from market.config import ROLE_ACTIONS
        valid_actions = ROLE_ACTIONS.get(role, [])

        rows = []
        for t in trajectories_data:
            rows.append({
                "prompt": [
                    {"role": "system", "content": t["system_prompt"]},
                    {"role": "user", "content": t["user_message"]},
                ],
                "expected_action": json.dumps(t["assistant_response"]),
                "trajectory_reward": t["reward"],
            })

        dataset = Dataset.from_list(rows)

        # Reward function that scores EACH generated completion independently.
        # GRPO needs reward variance within a group to produce gradients.
        def score_completion(completions, **kwargs) -> list[float]:
            """Score each completion based on format quality and action validity."""
            rewards = []
            for completion in completions:
                text = completion[0]["content"] if isinstance(completion, list) else str(completion)
                score = 0.0

                # 1. Valid JSON? (+0.3)
                parsed = None
                try:
                    start = text.find("{")
                    end = text.rfind("}") + 1
                    if start >= 0 and end > start:
                        parsed = json.loads(text[start:end])
                        score += 0.3
                except (json.JSONDecodeError, ValueError):
                    pass

                if parsed and isinstance(parsed, dict):
                    # 2. Has action_type field? (+0.2)
                    if "action_type" in parsed:
                        score += 0.2
                        # 3. Valid action_type for this role? (+0.3)
                        if parsed["action_type"] in valid_actions:
                            score += 0.3
                    # 4. Has reasoning? (+0.1)
                    if parsed.get("reasoning"):
                        score += 0.1
                    # 5. Has target? (+0.1)
                    if parsed.get("target"):
                        score += 0.1

                rewards.append(score)
            return rewards

        # GRPO config — no vLLM integration (avoids known bugs)
        output_dir = os.path.join(_lora_output_dir, role)
        os.makedirs(output_dir, exist_ok=True)

        training_args = GRPOConfig(
            output_dir=output_dir,
            use_vllm=False,
            num_generations=8,           # More completions = more reward variance
            max_prompt_length=512,
            max_completion_length=256,
            temperature=0.9,             # Higher temp = more diverse completions
            learning_rate=learning_rate,
            per_device_train_batch_size=1,
            gradient_accumulation_steps=4,
            num_train_epochs=3,          # Multiple passes over small dataset
            max_steps=min(50, len(rows) * 3),
            bf16=True,
            optim="adamw_8bit",
            logging_steps=1,
            save_steps=50,
            report_to="none",
        )

        trainer = GRPOTrainer(
            model=model,
            args=training_args,
            train_dataset=dataset,
            reward_funcs=[score_completion],
            tokenizer=tokenizer,
        )

        logger.info(f"Starting GRPO training for {role} ({len(rows)} trajectories)...")
        trainer.train()

        # Save LoRA adapter
        adapter_path = os.path.join(output_dir, "adapter")
        model.save_pretrained(adapter_path)
        tokenizer.save_pretrained(adapter_path)
        logger.info(f"LoRA adapter saved to {adapter_path}")

        # Hot-load into vLLM
        lora_name = f"office-os-{role}"
        loaded = _hotload_lora(lora_name, adapter_path)

        _global_step += 1
        _train_steps[role] = _train_steps.get(role, 0) + 1

        # Free GPU memory
        del model, trainer, tokenizer
        gc.collect()
        torch.cuda.empty_cache()

        return {
            "status": "trained",
            "role": role,
            "step": _global_step,
            "role_step": _train_steps[role],
            "trajectories_used": len(rows),
            "lora_loaded": loaded,
            "model_name": lora_name if loaded else _base_model,
            "adapter_path": adapter_path,
        }

    except Exception as e:
        logger.error(f"Training failed for {role}: {e}", exc_info=True)
        # Free GPU memory on failure
        gc.collect()
        try:
            import torch
            torch.cuda.empty_cache()
        except Exception:
            pass
        return {"status": "error", "role": role, "error": str(e)}


def _hotload_lora(lora_name: str, adapter_path: str) -> bool:
    """Hot-load a LoRA adapter into the running vLLM server."""
    try:
        import urllib.request
        payload = json.dumps({
            "lora_name": lora_name,
            "lora_path": adapter_path,
        }).encode()

        req = urllib.request.Request(
            f"{_vllm_url}/v1/load_lora_adapter",
            data=payload,
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = resp.read().decode()
            logger.info(f"LoRA hot-loaded into vLLM: {lora_name} -> {result}")
            return True
    except Exception as e:
        logger.warning(f"Failed to hot-load LoRA into vLLM: {e}")
        logger.warning("vLLM will continue serving base model. Load manually later.")
        return False


class Handler(BaseHTTPRequestHandler):
    """HTTP handler for training worker."""

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {
                "status": "ok",
                "vllm_url": _vllm_url,
                "global_step": _global_step,
                "train_steps": _train_steps,
                "base_model": _base_model,
                "lora_output_dir": _lora_output_dir,
            })
        elif self.path == "/models":
            self._json(200, {
                "train_steps": _train_steps,
                "global_step": _global_step,
                "base_model": _base_model,
            })
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

            logger.info(f"Training request for {role}: {len(data.get('trajectories', []))} trajectories")
            with _lock:
                result = _train_grpo(
                    role,
                    data.get("trajectories", []),
                    data.get("learning_rate", 5e-6),
                )
            self._json(200, result)

        elif self.path == "/hotload":
            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                self._json(400, {"error": "Invalid JSON"})
                return
            lora_name = data.get("lora_name", "")
            adapter_path = data.get("adapter_path", "")
            if not lora_name or not adapter_path:
                self._json(400, {"error": "Missing lora_name or adapter_path"})
                return
            loaded = _hotload_lora(lora_name, adapter_path)
            self._json(200, {"loaded": loaded, "lora_name": lora_name})

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
    p = argparse.ArgumentParser(description="TRL GRPO Training Worker")
    p.add_argument("--port", type=int, default=8081)
    p.add_argument("--host", type=str, default="0.0.0.0")
    p.add_argument("--base-model", type=str, default="Qwen/Qwen2.5-3B-Instruct")
    p.add_argument("--vllm-url", type=str, default="http://localhost:8080")
    p.add_argument("--lora-dir", type=str, default="/tmp/office_os_lora")
    args = p.parse_args()

    global _base_model, _vllm_url, _lora_output_dir
    _base_model = args.base_model
    _vllm_url = args.vllm_url
    _lora_output_dir = args.lora_dir

    logger.info(f"TRL GRPO Training Worker on {args.host}:{args.port}")
    logger.info(f"Base model: {_base_model}")
    logger.info(f"vLLM server: {_vllm_url}")
    logger.info(f"LoRA output: {_lora_output_dir}")
    logger.info(f"Endpoints:")
    logger.info(f"  GET  /health   - Status")
    logger.info(f"  POST /train    - Train a role with GRPO")
    logger.info(f"  POST /hotload  - Hot-load a LoRA into vLLM")

    server = HTTPServer((args.host, args.port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
