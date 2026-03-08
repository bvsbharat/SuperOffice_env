#!/usr/bin/env python3
"""Send expert trajectories to the Northflank training worker.

Usage:
    python send_training.py                              # all roles, defaults
    python send_training.py --roles dev sales            # specific roles
    python send_training.py --wandb office-os --hf user/repo  # with logging
    python send_training.py --dry-run                    # preview without sending
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

# Allow running from office_os/ or project root
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

TRAIN_ENDPOINT = os.environ.get(
    "NORTHFLANK_TRAIN_ENDPOINT",
    "https://training--jupyter-pytorch--ddk86ftkfknr.code.run",
)
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "training_data")
ALL_ROLES = ["ceo", "dev", "marketing", "sales", "content", "hr"]
SKIP_ROLES = {"customer"}  # no LoRA needed


def load_trajectories(role: str) -> list[dict]:
    """Load expert trajectories for a role from JSONL."""
    path = os.path.join(DATA_DIR, f"expert_{role}.jsonl")
    if not os.path.exists(path):
        print(f"  !! {path} not found, skipping")
        return []
    rows = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            rows.append({
                "system_prompt": row["system_prompt"],
                "user_message": row["user_message"],
                "assistant_response": row["assistant_response"],
                "reward": row.get("reward", 0.5),
            })
    return rows


def check_health() -> dict | None:
    """Check training worker health."""
    import urllib.request
    try:
        url = f"{TRAIN_ENDPOINT.rstrip('/')}/health"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"!! Worker unreachable: {e}")
        return None


def send_train_request(role: str, trajectories: list[dict],
                       wandb_project: str = "", hf_repo: str = "",
                       learning_rate: float = 2e-5) -> dict:
    """POST training request to the worker."""
    import urllib.request
    url = f"{TRAIN_ENDPOINT.rstrip('/')}/train"
    payload = {
        "role": role,
        "base_model": "Qwen/Qwen2.5-14B-Instruct",
        "learning_rate": learning_rate,
        "trajectories": trajectories,
    }
    if wandb_project:
        payload["wandb_project"] = wandb_project
    if hf_repo:
        payload["hf_repo"] = hf_repo

    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={"Content-Type": "application/json"},
    )
    # Training can take 5-10 min per role on H100
    with urllib.request.urlopen(req, timeout=900) as resp:
        return json.loads(resp.read().decode())


def main():
    parser = argparse.ArgumentParser(description="Send expert trajectories to Northflank")
    parser.add_argument("--roles", nargs="*", default=ALL_ROLES,
                        help="Roles to train (default: all)")
    parser.add_argument("--wandb", type=str, default="",
                        help="W&B project name (e.g. office-os)")
    parser.add_argument("--hf", type=str, default="",
                        help="HuggingFace repo (e.g. username/office-os-loras)")
    parser.add_argument("--lr", type=float, default=2e-5,
                        help="Learning rate (default: 2e-5)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview what would be sent without sending")
    args = parser.parse_args()

    print(f"=== Office OS Fine-Tuning Demo ===")
    print(f"Endpoint: {TRAIN_ENDPOINT}")
    print(f"Roles:    {args.roles}")
    print(f"W&B:      {args.wandb or '(not set)'}")
    print(f"HF:       {args.hf or '(not set)'}")
    print()

    # Health check
    print(">> Checking worker health...")
    health = check_health()
    if not health:
        print("!! Training worker is not reachable. Is Northflank running?")
        sys.exit(1)

    print(f"   Status: {health['status']}")
    print(f"   Model:  {health['base_model']}")
    print(f"   Step:   {health['global_step']}")
    print(f"   W&B:    {health.get('wandb_project', 'unknown')}")
    print(f"   HF:     {health.get('hf_repo', 'unknown')}")
    print()

    # Load and send per role
    results = []
    for role in args.roles:
        if role in SKIP_ROLES:
            print(f">> Skipping {role} (no LoRA needed)")
            continue

        trajectories = load_trajectories(role)
        if not trajectories:
            continue

        print(f">> {role}: {len(trajectories)} trajectories")

        if args.dry_run:
            print(f"   [DRY RUN] Would send {len(trajectories)} trajectories")
            results.append({"role": role, "status": "dry_run", "count": len(trajectories)})
            continue

        print(f"   Sending to worker... (this takes 5-10 min per role on H100)")
        t0 = time.time()
        try:
            result = send_train_request(
                role, trajectories,
                wandb_project=args.wandb,
                hf_repo=args.hf,
                learning_rate=args.lr,
            )
            elapsed = time.time() - t0
            status = result.get("status", "unknown")
            print(f"   Result: {status} ({elapsed:.0f}s)")
            if result.get("hf_pushed"):
                print(f"   >> Pushed to HuggingFace!")
            if result.get("lora_loaded"):
                print(f"   >> LoRA hot-loaded into vLLM: {result.get('model_name')}")
            results.append(result)
        except Exception as e:
            elapsed = time.time() - t0
            print(f"   !! Failed ({elapsed:.0f}s): {e}")
            results.append({"role": role, "status": "error", "error": str(e)})

        print()

    # Summary
    print("=== Summary ===")
    trained = [r for r in results if r.get("status") == "trained"]
    errors = [r for r in results if r.get("status") == "error"]
    print(f"Trained: {len(trained)}/{len(results)} roles")
    if errors:
        print(f"Errors:  {len(errors)}")
        for e in errors:
            print(f"  - {e['role']}: {e.get('error', 'unknown')}")

    # Final health check
    if not args.dry_run and trained:
        print()
        print(">> Final worker state:")
        final = check_health()
        if final:
            print(f"   Global step: {final['global_step']}")
            print(f"   Train steps: {final['train_steps']}")


if __name__ == "__main__":
    main()
