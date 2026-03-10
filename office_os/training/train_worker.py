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
        --model Qwen/Qwen3.5-0.8B --port 8080 --host 0.0.0.0 \\
        --enable-lora --max-loras 2 --max-lora-rank 64 \\
        --gpu-memory-utilization 0.9 --max-model-len 262144 --enforce-eager

    # Terminal 2: Training worker
    python training/train_worker.py --port 8081 --base-model Qwen/Qwen3.5-0.8B
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

ALL_ROLES = ["ceo", "dev", "marketing", "sales", "content", "hr"]
SKIP_TRAINING = {"customer"}  # Customer role uses base model, no LoRA needed


class TrainingState:
    """Encapsulates all mutable training worker state.

    Replaces scattered global variables with a single thread-safe instance.
    State can be checkpointed/restored if needed in the future.
    """

    def __init__(
        self,
        base_model: str = "Qwen/Qwen3.5-0.8B",
        vllm_url: str = "http://localhost:8080",
        lora_output_dir: str = "/tmp/office_os_lora",
        hf_repo: str = "",
        wandb_project: str = "",
        judge_provider: str = "",
        judge_model: str = "",
    ):
        self.base_model = base_model
        self.vllm_url = vllm_url
        self.lora_output_dir = lora_output_dir
        self.hf_repo = hf_repo
        self.wandb_project = wandb_project
        self.judge_provider = judge_provider or os.environ.get(
            "JUDGE_PROVIDER",
            "bedrock" if os.environ.get("CLAUDE_CODE_USE_BEDROCK") else "vllm",
        )
        self.judge_model = judge_model or os.environ.get("JUDGE_MODEL", "")
        self.openrouter_api_key = os.environ.get("OPENROUTER_API_KEY", "")
        self.train_steps: dict[str, int] = {role: 0 for role in ALL_ROLES}
        self.global_step: int = 0
        self.lock = threading.Lock()

    def get_judge_model(self) -> str:
        if self.judge_model:
            return self.judge_model
        defaults = {
            "bedrock": "us.anthropic.claude-sonnet-4-20250514-v1:0",
            "anthropic": "claude-sonnet-4-20250514",
            "openrouter": "anthropic/claude-sonnet-4",
            "vllm": self.base_model,
        }
        return defaults.get(self.judge_provider, self.base_model)

    def to_dict(self) -> dict:
        return {
            "base_model": self.base_model,
            "vllm_url": self.vllm_url,
            "global_step": self.global_step,
            "train_steps": dict(self.train_steps),
            "lora_output_dir": self.lora_output_dir,
            "judge_provider": self.judge_provider,
            "judge_model": self.get_judge_model(),
            "wandb_project": self.wandb_project or "(not set)",
            "hf_repo": self.hf_repo or "(not set)",
        }


# Singleton instance — initialised in main(), used by handler & training fns
_state = TrainingState()


def _get_judge_model() -> str:
    """Get the judge model name, with sensible defaults per provider."""
    return _state.get_judge_model()


def _judge_via_bedrock(prompt: str) -> str | None:
    """Call Claude via AWS Bedrock."""
    import boto3
    region = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
    client = boto3.client("bedrock-runtime", region_name=region)
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 8,
        "temperature": 0.0,
        "messages": [{"role": "user", "content": prompt}],
    })
    resp = client.invoke_model(modelId=_state.get_judge_model(), body=body, contentType="application/json")
    result = json.loads(resp["body"].read())
    return result["content"][0]["text"].strip()


def _judge_via_anthropic(prompt: str) -> str | None:
    """Call Claude via Anthropic API."""
    import anthropic
    client = anthropic.Anthropic()
    resp = client.messages.create(
        model=_state.get_judge_model(),
        max_tokens=8,
        temperature=0.0,
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.content[0].text.strip()


def _judge_via_openai_compat(prompt: str, base_url: str, api_key: str, model: str) -> str | None:
    """Call any OpenAI-compatible endpoint (OpenRouter, vLLM)."""
    import urllib.request
    payload = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 8,
        "temperature": 0.0,
    }).encode()
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    req = urllib.request.Request(
        f"{base_url}/v1/chat/completions",
        data=payload, method="POST", headers=headers,
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        result = json.loads(resp.read().decode())
        return result["choices"][0]["message"]["content"].strip()


def _llm_judge(text: str, role: str, valid_actions: list[str]) -> float:
    """LLM-as-a-judge to score a completion.

    Provider is configured via JUDGE_PROVIDER env var:
      - "bedrock"    — Claude via AWS Bedrock (default when CLAUDE_CODE_USE_BEDROCK is set)
      - "anthropic"  — Claude via Anthropic API (needs ANTHROPIC_API_KEY)
      - "openrouter" — Any model via OpenRouter (needs OPENROUTER_API_KEY)
      - "vllm"       — Local vLLM on the same machine (default fallback)

    Model is configured via JUDGE_MODEL env var (auto-detected per provider if unset).

    Returns a score from 0.0 to 1.0. Falls back to 0.25 on any error.
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
        reply = None
        if _state.judge_provider == "bedrock":
            reply = _judge_via_bedrock(judge_prompt)
        elif _state.judge_provider == "anthropic":
            reply = _judge_via_anthropic(judge_prompt)
        elif _state.judge_provider == "openrouter":
            reply = _judge_via_openai_compat(
                judge_prompt, "https://openrouter.ai/api", _state.openrouter_api_key, _state.get_judge_model(),
            )
        else:  # "vllm" or unknown — use local vLLM
            reply = _judge_via_openai_compat(
                judge_prompt, _state.vllm_url, "", _state.get_judge_model(),
            )

        if reply:
            for ch in reply:
                if ch.isdigit() and ch in "12345":
                    return (int(ch) - 1) / 4.0  # Normalize: 1->0.0, 5->1.0
        return 0.25  # 2/5 = "poor", not neutral
    except Exception as e:
        logger.warning(f"LLM judge ({_state.judge_provider}) failed: {e}")
        return 0.25  # 2/5 = "poor" on failure — don't reward bad outputs


def _train_grpo(role: str, trajectories_data: list, learning_rate: float = 2e-5) -> dict:
    """Train with TRL GRPO using Unsloth. Saves LoRA and hot-loads into vLLM."""
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
            model_name=_state.base_model,
            max_seq_length=262144,  # Qwen3.5-0.8B full 262K native context
            load_in_4bit=True,
        )

        model = FastLanguageModel.get_peft_model(
            model,
            r=16,  # Reduced for 3B model (was 32 for 14B)
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                            "gate_proj", "up_proj", "down_proj"],
            lora_alpha=16,
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

        # --- Reward functions aligned with market/metrics.py RewardCalculator ---
        # Weights match the simulation's decomposed reward signals so training
        # optimises the same objective the agent is evaluated on at runtime.

        def score_completion(completions, **kwargs) -> list[float]:
            """Score each completion using weights aligned with simulation rewards.

            Sub-signal weights mirror market/metrics.py RewardCalculator:
              format_reward:      0.1  (valid action_type present)
              role_compliance:    0.2  (action in ROLE_ACTIONS) / -0.5 penalty
              execution_proxy:    0.3  (well-formed JSON that could execute)
              impact_proxy:       0.3  (reasoning quality + context grounding)
              collaboration:      0.1  (proper inter-agent messaging)
              efficiency:        -0.1  (penalise empty/minimal output)
            """
            rewards = []
            for completion in completions:
                text = completion[0]["content"] if isinstance(completion, list) else str(completion)
                score = 0.0

                # --- format_reward (0.1) — matches metrics.py format_reward ---
                parsed = None
                try:
                    start = text.find("{")
                    end = text.rfind("}") + 1
                    if start >= 0 and end > start:
                        parsed = json.loads(text[start:end])
                except (json.JSONDecodeError, ValueError):
                    pass

                if parsed and isinstance(parsed, dict) and "action_type" in parsed:
                    score += 0.1  # format_reward

                    # --- role_compliance (0.2 / -0.5) — matches metrics.py ---
                    if parsed["action_type"] in valid_actions:
                        score += 0.2
                    else:
                        score -= 0.5

                    # --- execution_proxy (0.3) — valid structure = likely to execute ---
                    can_execute = True
                    if not parsed.get("target") and parsed["action_type"] not in (
                        "SHIP_RELEASE", "TEAM_SYNC", "REVIEW_STRATEGY", "TRACK_OKRS"
                    ):
                        can_execute = False
                    # Clean JSON-only output (no extra text)
                    before_json = text[:text.find("{")].strip()
                    after_json = text[text.rfind("}") + 1:].strip()
                    if before_json or after_json:
                        can_execute = False
                    score += 0.3 if can_execute else -0.1

                    # --- impact_proxy (up to 0.3) — reasoning + context grounding ---
                    reasoning = parsed.get("reasoning", "")
                    words = len(reasoning.split()) if reasoning else 0
                    if words >= 15:
                        score += 0.15  # Substantive reasoning
                    elif words >= 8:
                        score += 0.1
                    elif words >= 3:
                        score += 0.05

                    target = parsed.get("target", "")
                    if target and len(target) > 1:
                        score += 0.05
                        # Context grounding — references real entities from observation
                        if any(e.lower() in target.lower() for e in _context_entities if len(e) > 2):
                            score += 0.1

                    # --- collaboration (0.1) — proper inter-agent messaging ---
                    message = parsed.get("message", "")
                    if message and ":" in str(message):
                        msg_parts = str(message).split(":", 1)
                        if msg_parts[0].strip().lower() in ALL_ROLES:
                            score += 0.1

                else:
                    # No valid action parsed — equivalent to failed execution (-1.0)
                    # but clamped for GRPO stability
                    score = -0.5

                rewards.append(score)
            return rewards

        # Trajectory-based reward: uses actual simulation reward as signal.
        # This bridges the gap between training reward and runtime reward.
        def trajectory_alignment_reward(completions, **kwargs) -> list[float]:
            """Score completions by similarity to high-reward trajectory actions.

            Completions that produce the same action_type as the original
            trajectory get the trajectory's actual simulation reward (normalised).
            This ensures GRPO optimises toward actions the simulation rewards.
            """
            scores = []
            for completion in completions:
                text = completion[0]["content"] if isinstance(completion, list) else str(completion)
                parsed = None
                try:
                    start = text.find("{")
                    end = text.rfind("}") + 1
                    if start >= 0 and end > start:
                        parsed = json.loads(text[start:end])
                except (json.JSONDecodeError, ValueError):
                    pass

                if not parsed or not isinstance(parsed, dict):
                    scores.append(0.0)
                    continue

                gen_action = parsed.get("action_type", "")
                # Find best matching trajectory and use its simulation reward
                best_score = 0.0
                for t in trajectories_data:
                    t_action = t.get("assistant_response", {}).get("action_type", "")
                    t_reward = t.get("reward", 0.0)
                    # Normalise trajectory reward to [0, 1] range
                    norm_reward = max(0.0, min(1.0, (t_reward + 2.0) / 12.0))

                    if gen_action == t_action:
                        # Same action type — use simulation reward
                        best_score = max(best_score, norm_reward)
                        # Bonus if target also matches
                        gen_target = parsed.get("target", "").lower()
                        t_target = t.get("assistant_response", {}).get("target", "").lower()
                        if gen_target and t_target and gen_target in t_target:
                            best_score = min(1.0, best_score + 0.1)

                scores.append(best_score)
            return scores

        # LLM-as-a-judge reward: uses local vLLM to rate strategic quality
        def llm_judge_reward(completions, **kwargs) -> list[float]:
            """Score completions using the local vLLM as a judge."""
            scores = []
            for completion in completions:
                text = completion[0]["content"] if isinstance(completion, list) else str(completion)
                scores.append(_llm_judge(text, role, valid_actions))
            return scores

        # GRPO config — no vLLM integration (avoids known bugs)
        output_dir = os.path.join(_state.lora_output_dir, role)
        os.makedirs(output_dir, exist_ok=True)

        # W&B logging
        report_to = "none"
        run_name = None
        if _state.wandb_project:
            try:
                import wandb
                report_to = "wandb"
                run_name = f"{role}-step{_state.global_step + 1}"
                os.environ.setdefault("WANDB_PROJECT", _state.wandb_project)
                logger.info(f"W&B logging enabled: project={_state.wandb_project}, run={run_name}")
            except ImportError:
                logger.warning("wandb not installed, skipping W&B logging")

        training_args = GRPOConfig(
            output_dir=output_dir,
            use_vllm=False,
            num_generations=8,           # More generations = better GRPO baselines for group comparison
            max_prompt_length=65536,  # 64K prompt for GRPO training (Qwen3.5-0.8B supports 262K)
            max_completion_length=4096,  # 4K completion budget
            temperature=0.7,             # Moderate temp: diverse but focused completions
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
            reward_funcs=[score_completion, trajectory_alignment_reward, llm_judge_reward],
            tokenizer=tokenizer,
        )

        logger.info(f"Starting GRPO training for {role} ({len(rows)} trajectories)...")
        trainer.train()

        # Save LoRA adapter
        adapter_path = os.path.join(output_dir, "adapter")
        model.save_pretrained(adapter_path)
        tokenizer.save_pretrained(adapter_path)
        logger.info(f"LoRA adapter saved to {adapter_path}")

        # Push to HuggingFace — use upload_folder for reliable subfolder support
        hf_pushed = False
        if _state.hf_repo:
            try:
                from huggingface_hub import HfApi
                api = HfApi()
                subfolder = f"{role}/step-{_state.global_step + 1}"
                api.upload_folder(
                    folder_path=adapter_path,
                    repo_id=_state.hf_repo,
                    path_in_repo=subfolder,
                    commit_message=f"LoRA {role} step {_state.global_step + 1}",
                )
                logger.info(f"Pushed LoRA to HuggingFace: {_state.hf_repo}/{subfolder}")
                hf_pushed = True
            except Exception as e:
                logger.warning(f"Failed to push to HuggingFace: {e}")

        # Finish W&B run
        if _state.wandb_project:
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

        _state.global_step += 1
        _state.train_steps[role] = _state.train_steps.get(role, 0) + 1

        # Free GPU memory
        del model, trainer, tokenizer
        gc.collect()
        torch.cuda.empty_cache()

        return {
            "status": "trained",
            "role": role,
            "step": _state.global_step,
            "role_step": _state.train_steps[role],
            "trajectories_used": len(rows),
            "lora_loaded": loaded,
            "hf_pushed": hf_pushed,
            "model_name": lora_name if loaded else _state.base_model,
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
            f"{_state.vllm_url}/v1/load_lora_adapter",
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
            self._json(200, {"status": "ok", **_state.to_dict()})
        elif self.path == "/models":
            self._json(200, {
                "train_steps": _state.train_steps,
                "global_step": _state.global_step,
                "base_model": _state.base_model,
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

            # Allow per-request overrides for wandb/HF (avoids worker restart)
            req_wandb = data.get("wandb_project", "")
            req_hf = data.get("hf_repo", "")
            if req_wandb:
                _state.wandb_project = req_wandb
                logger.info(f"W&B project set via request: {_state.wandb_project}")
            if req_hf:
                _state.hf_repo = req_hf
                logger.info(f"HF repo set via request: {_state.hf_repo}")

            logger.info(f"Training request for {role}: {len(data.get('trajectories', []))} trajectories")
            with _state.lock:
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
    p.add_argument("--base-model", type=str, default="Qwen/Qwen3.5-0.8B")
    p.add_argument("--vllm-url", type=str, default="http://localhost:8080")
    p.add_argument("--lora-dir", type=str, default="/tmp/office_os_lora")
    p.add_argument("--hf-repo", type=str, default="",
                   help="HuggingFace repo to push LoRAs (e.g. username/office-os-loras)")
    p.add_argument("--wandb-project", type=str, default="",
                   help="Weights & Biases project name for logging")
    p.add_argument("--judge-provider", type=str, default="",
                   help="LLM judge provider: bedrock, anthropic, openrouter, vllm (default: bedrock if CLAUDE_CODE_USE_BEDROCK set, else vllm)")
    p.add_argument("--judge-model", type=str, default="",
                   help="LLM judge model (auto-detected per provider if unset)")
    args = p.parse_args()

    global _state
    _state = TrainingState(
        base_model=args.base_model,
        vllm_url=args.vllm_url,
        lora_output_dir=args.lora_dir,
        hf_repo=args.hf_repo or os.environ.get("HF_REPO", ""),
        wandb_project=args.wandb_project or os.environ.get("WANDB_PROJECT", ""),
        judge_provider=args.judge_provider,
        judge_model=args.judge_model,
    )

    logger.info(f"TRL GRPO Training Worker on {args.host}:{args.port}")
    logger.info(f"Base model: {_state.base_model}")
    logger.info(f"vLLM server: {_state.vllm_url}")
    logger.info(f"LoRA output: {_state.lora_output_dir}")
    logger.info(f"LLM Judge: provider={_state.judge_provider}, model={_state.get_judge_model()}")
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
