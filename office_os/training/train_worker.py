"""
TRL GRPO Training Worker for Office OS on Northflank H100.

Uses TRL + Unsloth for GRPO training with custom reward functions.
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
_hf_repo = ""       # e.g. "username/office-os-loras"
_wandb_project = "" # e.g. "office-os"

ALL_ROLES = ["ceo", "dev", "marketing", "sales", "content", "hr"]
SKIP_TRAINING = {"customer"}  # Customer role uses base model, no LoRA needed

# Initialize step counters
for role in ALL_ROLES:
    _train_steps[role] = 0


def _llm_judge(text: str, role: str, valid_actions: list[str]) -> float:
    """Use the local vLLM as an LLM-as-a-judge to score a completion.

    Returns a score from 0.0 to 1.0 based on strategic quality.
    Falls back to 0.5 (neutral) on any error to avoid blocking training.
    """
    actions_str = ", ".join(valid_actions)
    judge_prompt = (
        f"You are a judge evaluating an AI agent's action in a startup simulation.\n"
        f"The agent plays the '{role}' role. Valid actions: {actions_str}\n\n"
        f"Rate this response on a scale of 1-5:\n"
        f"1 = Invalid/garbage output\n"
        f"2 = Valid format but poor strategic choice\n"
        f"3 = Acceptable action, generic reasoning\n"
        f"4 = Good action with clear strategic reasoning\n"
        f"5 = Excellent — right action, specific target, strong reasoning, good team communication\n\n"
        f"Agent response:\n{text[:500]}\n\n"
        f"Reply with ONLY a single number (1-5)."
    )
    try:
        import urllib.request
        payload = json.dumps({
            "model": _base_model,
            "messages": [{"role": "user", "content": judge_prompt}],
            "max_tokens": 8,
            "temperature": 0.0,
        }).encode()
        req = urllib.request.Request(
            f"{_vllm_url}/v1/chat/completions",
            data=payload,
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode())
            reply = result["choices"][0]["message"]["content"].strip()
            # Extract first digit 1-5
            for ch in reply:
                if ch.isdigit() and ch in "12345":
                    return (int(ch) - 1) / 4.0  # Normalize: 1->0.0, 5->1.0
        return 0.5
    except Exception:
        return 0.5  # Neutral on failure — don't block training


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

        # Collect context from trajectories for context-aware scoring
        # Extract customer names, feature names, etc. from user messages
        _context_entities = set()
        for t in trajectories_data:
            msg = t.get("user_message", "")
            # Extract customer names from pipeline sections
            for line in msg.split("\n"):
                line = line.strip()
                if "name" in line.lower() and ":" in line:
                    _context_entities.add(line.split(":")[-1].strip().strip("'\""))
                # Pick up known keywords
                for keyword in ["Acme", "TechStart", "MedFlow", "RetailAI",
                                "GreenScale", "FinServ", "EduTech", "DataDriven",
                                "SSO", "compliance", "onboarding", "HIPAA", "API"]:
                    if keyword.lower() in line.lower():
                        _context_entities.add(keyword)

        # Average trajectory reward for this batch (used to weight quality)
        _avg_traj_reward = 0.0
        if trajectories_data:
            _avg_traj_reward = sum(t.get("reward", 0) for t in trajectories_data) / len(trajectories_data)

        # Reward function that scores EACH generated completion independently.
        # GRPO needs reward variance within a group to produce gradients.
        def score_completion(completions, **kwargs) -> list[float]:
            """Score each completion on format, validity, and quality."""
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

                # 2. Clean output — no extra text outside JSON (-0.1)
                if parsed:
                    before_json = text[:text.find("{")].strip()
                    after_json = text[text.rfind("}") + 1:].strip()
                    if not before_json and not after_json:
                        score += 0.1  # Bonus for clean JSON-only output

                if parsed and isinstance(parsed, dict):
                    # 3. Has action_type field? (+0.2)
                    if "action_type" in parsed:
                        score += 0.2
                        # 4. Valid action_type for this role? (+0.3)
                        if parsed["action_type"] in valid_actions:
                            score += 0.3
                        else:
                            score -= 0.2  # Penalty for wrong-role action

                    # 5. Reasoning quality (0 to +0.2)
                    reasoning = parsed.get("reasoning", "")
                    if reasoning:
                        words = len(reasoning.split())
                        if words >= 10:
                            score += 0.2  # Substantive reasoning
                        elif words >= 5:
                            score += 0.1  # Brief but present
                        else:
                            score += 0.05  # Minimal

                    # 6. Has non-empty target? (+0.1)
                    target = parsed.get("target", "")
                    if target and target != "auto" and len(target) > 1:
                        score += 0.1
                        # 7. Target references context entities? (+0.1)
                        if any(e.lower() in target.lower() for e in _context_entities if len(e) > 2):
                            score += 0.1

                    # 8. Message field with proper format "role: text"? (+0.1)
                    message = parsed.get("message", "")
                    if message and ":" in str(message):
                        msg_parts = str(message).split(":", 1)
                        if msg_parts[0].strip().lower() in ["ceo", "dev", "marketing",
                                                             "sales", "content", "hr"]:
                            score += 0.1

                    # 9. Has parameters dict? (+0.05)
                    if isinstance(parsed.get("parameters"), dict) and parsed["parameters"]:
                        score += 0.05

                rewards.append(max(score, 0.0))
            return rewards

        # LLM-as-a-judge reward: uses local vLLM to rate strategic quality
        def llm_judge_reward(completions, **kwargs) -> list[float]:
            """Score completions using the local vLLM as a judge."""
            scores = []
            for completion in completions:
                text = completion[0]["content"] if isinstance(completion, list) else str(completion)
                scores.append(_llm_judge(text, role, valid_actions))
            return scores

        # GRPO config — no vLLM integration (avoids known bugs)
        output_dir = os.path.join(_lora_output_dir, role)
        os.makedirs(output_dir, exist_ok=True)

        # W&B logging
        report_to = "none"
        run_name = None
        if _wandb_project:
            try:
                import wandb
                report_to = "wandb"
                run_name = f"{role}-step{_global_step + 1}"
                os.environ.setdefault("WANDB_PROJECT", _wandb_project)
                logger.info(f"W&B logging enabled: project={_wandb_project}, run={run_name}")
            except ImportError:
                logger.warning("wandb not installed, skipping W&B logging")

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
            report_to=report_to,
            run_name=run_name,
        )

        trainer = GRPOTrainer(
            model=model,
            args=training_args,
            train_dataset=dataset,
            reward_funcs=[score_completion, llm_judge_reward],
            tokenizer=tokenizer,
        )

        logger.info(f"Starting GRPO training for {role} ({len(rows)} trajectories)...")
        trainer.train()

        # Save LoRA adapter
        adapter_path = os.path.join(output_dir, "adapter")
        model.save_pretrained(adapter_path)
        tokenizer.save_pretrained(adapter_path)
        logger.info(f"LoRA adapter saved to {adapter_path}")

        # Push to HuggingFace
        hf_pushed = False
        if _hf_repo:
            try:
                subfolder = f"{role}/step-{_global_step + 1}"
                model.push_to_hub(_hf_repo, subfolder=subfolder)
                tokenizer.push_to_hub(_hf_repo, subfolder=subfolder)
                logger.info(f"Pushed LoRA to HuggingFace: {_hf_repo}/{subfolder}")
                hf_pushed = True
            except Exception as e:
                logger.warning(f"Failed to push to HuggingFace: {e}")

        # Finish W&B run
        if _wandb_project:
            try:
                import wandb
                if wandb.run:
                    wandb.run.summary["role"] = role
                    wandb.run.summary["trajectories"] = len(rows)
                    wandb.run.summary["hf_pushed"] = hf_pushed
                    wandb.finish()
            except Exception:
                pass

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
            "hf_pushed": hf_pushed,
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

            if role in SKIP_TRAINING:
                self._json(200, {"status": "skipped", "role": role, "reason": "no training needed"})
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
    p.add_argument("--hf-repo", type=str, default="",
                   help="HuggingFace repo to push LoRAs (e.g. username/office-os-loras)")
    p.add_argument("--wandb-project", type=str, default="",
                   help="Weights & Biases project name for logging")
    args = p.parse_args()

    global _base_model, _vllm_url, _lora_output_dir, _hf_repo, _wandb_project
    _base_model = args.base_model
    _vllm_url = args.vllm_url
    _lora_output_dir = args.lora_dir
    _hf_repo = args.hf_repo or os.environ.get("HF_REPO", "")
    _wandb_project = args.wandb_project or os.environ.get("WANDB_PROJECT", "")

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
