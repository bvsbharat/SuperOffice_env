#!/usr/bin/env python3
"""
Demo inference script — pull fine-tuned LoRAs from HuggingFace and run all 6 agents.

Usage:
    # Pull LoRAs from HF and run local inference (needs GPU)
    python demo_inference.py --hf-repo harshalhirpara/office-os-loras

    # Use the Northflank vLLM endpoint (LoRAs already hot-loaded)
    python demo_inference.py --vllm https://vllm--jupyter-pytorch--ddk86ftkfknr.code.run

    # Compare base model vs fine-tuned side by side
    python demo_inference.py --hf-repo harshalhirpara/office-os-loras --compare

    # Specific roles only
    python demo_inference.py --vllm https://vllm--...code.run --roles dev sales
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from agents.prompts import ROLE_PROMPTS

ALL_ROLES = ["ceo", "dev", "marketing", "sales", "content", "hr"]

ROLE_ACTIONS = {
    "ceo": ["SET_OKRS", "ALLOCATE_BUDGET", "REVIEW_STRATEGY", "PIVOT", "SEND_DIRECTIVE", "APPROVE_INITIATIVE"],
    "dev": ["BUILD_FEATURE", "FIX_BUG", "SHIP_RELEASE", "REFACTOR", "WRITE_DOCS", "REVIEW_PR"],
    "marketing": ["LAUNCH_CAMPAIGN", "RUN_AD", "RESEARCH_MARKET", "ANALYZE_COMPETITOR", "OPTIMIZE_FUNNEL", "A_B_TEST"],
    "sales": ["QUALIFY_LEAD", "RUN_DEMO", "SEND_PROPOSAL", "CLOSE_DEAL", "FOLLOW_UP", "COLLECT_FEEDBACK", "UPDATE_SHEET"],
    "content": ["WRITE_BLOG", "WRITE_SOCIAL_POST", "WRITE_CASE_STUDY", "WRITE_EMAIL_SEQUENCE", "WRITE_DOCS", "REVISE_CONTENT"],
    "hr": ["PLAN_SPRINT", "TRACK_OKRS", "RESOLVE_BLOCKER", "HIRE_CONTRACTOR", "PERFORMANCE_REVIEW", "TEAM_SYNC"],
}

# ── Sample scenario for demo ─────────────────────────────────────────────

DEMO_KPIS = {
    "day": 15,
    "website_traffic": 3200,
    "conversion_rate": 0.035,
    "revenue": 5000.0,
    "total_revenue": 45000.0,
    "brand_awareness": 28.0,
    "product_stability": 0.92,
    "budget_remaining": 72000.0,
    "active_customers": 3,
    "pipeline_value": 75000,
    "features_shipped": 3,
    "content_published": 5,
    "active_campaigns": 2,
    "team_velocity": 1.3,
    "nps_score": 62.0,
    "customer_satisfaction": 0.65,
    "okrs_set": 1,
    "blockers": 1,
}

DEMO_MESSAGES = [
    {"from": "ceo", "to": "all", "content": "Q1 focus: close Acme and MedFlow. Dev prioritize SSO."},
    {"from": "sales", "to": "dev", "content": "Acme demo went great but they need SSO before signing."},
    {"from": "content", "to": "marketing", "content": "New case study on API Integration published."},
]

DEMO_RECENT_ACTIONS = [
    {"agent_id": "dev", "action_type": "SHIP_RELEASE", "detail": "Shipped API Integration"},
    {"agent_id": "marketing", "action_type": "LAUNCH_CAMPAIGN", "detail": "Enterprise Security campaign"},
    {"agent_id": "sales", "action_type": "RUN_DEMO", "detail": "Demo for Acme Corp"},
]

DEMO_ROLE_DATA = {
    "ceo": {
        "team_status": {
            "dev": {"building": [{"name": "SSO Integration", "turns_remaining": 1}], "shipped": ["API Integration", "Onboarding Flow", "Dashboard v2"]},
            "sales": {"pipeline": [
                {"name": "Acme Corp", "stage": "demo", "budget": 50000, "pain_point": "Needs SSO & compliance"},
                {"name": "MedFlow Health", "stage": "qualified", "budget": 20000, "pain_point": "HIPAA compliance"},
                {"name": "TechStart Inc", "stage": "lead", "budget": 5000, "pain_point": "Wants fast onboarding"},
            ], "deals_won": []},
            "marketing": {"active_campaigns": 2, "conversion_rate": 3.5, "traffic": 3200},
            "content": {"published": ["API Integration case study", "SaaS Security blog"]},
        },
        "okrs": ["Close 3 deals this quarter"],
    },
    "dev": {
        "features_in_progress": [{"name": "SSO Integration", "turns_remaining": 0}],
        "backlog": [{"name": "HIPAA Compliance Module", "priority": "high"}, {"name": "Bulk Import", "priority": "medium"}],
        "bug_reports": [],
        "team_status": {
            "dev": {"building": [{"name": "SSO Integration", "turns_remaining": 0}], "shipped": ["API Integration", "Onboarding Flow", "Dashboard v2"]},
            "sales": {"pipeline": [
                {"name": "Acme Corp", "stage": "demo", "budget": 50000, "pain_point": "Needs SSO & compliance"},
            ]},
        },
        "available_actions": ["BUILD_FEATURE", "FIX_BUG", "SHIP_RELEASE"],
    },
    "marketing": {
        "active_campaigns": [{"name": "Enterprise Security", "days_remaining": 5, "spend": 500}],
        "budget_spent": 2800,
        "team_status": {
            "dev": {"shipped": ["API Integration", "Onboarding Flow", "Dashboard v2"]},
            "sales": {"pipeline": [
                {"name": "Acme Corp", "stage": "demo"},
                {"name": "MedFlow Health", "stage": "qualified"},
            ]},
            "content": {"published": ["API Integration case study", "SaaS Security blog"]},
        },
    },
    "sales": {
        "pipeline": [
            {"name": "Acme Corp", "stage": "demo", "budget": 50000, "pain_point": "Needs SSO & compliance", "days_since_contact": 1},
            {"name": "MedFlow Health", "stage": "qualified", "budget": 20000, "pain_point": "HIPAA compliance", "days_since_contact": 2},
            {"name": "TechStart Inc", "stage": "lead", "budget": 5000, "pain_point": "Wants fast onboarding", "days_since_contact": 4},
        ],
        "deals_won": [],
        "team_status": {
            "dev": {"shipped": ["API Integration", "Onboarding Flow", "Dashboard v2"], "building": [{"name": "SSO Integration", "turns_remaining": 0}]},
        },
    },
    "content": {
        "published": ["API Integration case study", "SaaS Security blog", "Onboarding Guide", "Product Update #3", "Customer Success Story"],
        "team_status": {
            "dev": {"shipped": ["API Integration", "Onboarding Flow", "Dashboard v2"]},
            "sales": {"pipeline": [{"name": "Acme Corp", "stage": "demo"}, {"name": "MedFlow Health", "stage": "qualified"}]},
        },
    },
    "hr": {
        "team_velocity": 1.3,
        "blockers": [{"description": "SSO integration blocked by auth provider API limits", "severity": "medium"}],
        "team_status": {
            "dev": {"building": [{"name": "SSO Integration", "turns_remaining": 0}], "shipped": ["API Integration", "Onboarding Flow", "Dashboard v2"]},
            "ceo": {"okrs": ["Close 3 deals this quarter"]},
        },
        "sprint": {"focus": "Ship SSO + close first deal", "velocity": 1.3},
    },
}


def build_demo_prompt(role: str) -> str:
    """Build a realistic demo prompt for a role."""
    kpis = json.dumps(DEMO_KPIS, indent=2)
    role_data = DEMO_ROLE_DATA.get(role, {})

    parts = [
        f"=== Day 15 | Phase: execution | Turn 42 ===",
        "",
        "## Your KPIs",
        kpis,
        "",
        f"Budget remaining: $72,000",
        "",
    ]

    # Role-specific context
    if role == "dev":
        parts.append("!! URGENT: 1 feature(s) ready to ship! Use SHIP_RELEASE now!")
        parts.append("")
    elif role == "sales":
        parts.append(">> PIPELINE — use the EXACT customer name as target:")
        for c in role_data.get("pipeline", []):
            stage_map = {"lead": "QUALIFY_LEAD", "qualified": "RUN_DEMO", "demo": "SEND_PROPOSAL", "proposal": "CLOSE_DEAL"}
            action = stage_map.get(c["stage"], "FOLLOW_UP")
            stale = " ⚠️STALE" if c.get("days_since_contact", 0) > 3 else ""
            parts.append(f'   "{c["name"]}" stage={c["stage"]} → use {action} target="{c["name"]}"{stale}')
        parts.append("")
    elif role == "content":
        shipped = role_data.get("team_status", {}).get("dev", {}).get("shipped", [])
        if shipped:
            parts.append(f">> SHIPPED FEATURES (safe for case studies): {', '.join(shipped)}")
        parts.append("")

    # Messages
    parts.append("## Team channel (recent messages)")
    for m in DEMO_MESSAGES:
        parts.append(f"  {m['from']} -> {m['to']}: {m['content']}")
    parts.append("")

    # Recent actions
    parts.append("## Recent team actions")
    for a in DEMO_RECENT_ACTIONS:
        parts.append(f"  [{a['agent_id']}] {a['action_type']} -> {a['detail']}")
    parts.append("")

    # Role data
    if role_data:
        role_str = json.dumps(role_data, indent=1, default=str)
        if len(role_str) > 800:
            role_str = role_str[:800] + "..."
        parts.append("## Your role data")
        parts.append(role_str)
        parts.append("")

    parts.append("Pick the HIGHEST IMPACT action. Respond with JSON only.")
    return "\n".join(parts)


def build_system_prompt(role: str) -> str:
    """Build the full system prompt with JSON instructions."""
    actions_list = "\n".join(f"  - {a}" for a in ROLE_ACTIONS[role])
    json_instruction = (
        f"\n\n## CRITICAL INSTRUCTIONS\n"
        f"You are the **{role}** agent. You can ONLY use these actions:\n"
        f"{actions_list}\n\n"
        f"Do NOT use actions from other roles. Any action not listed above is INVALID.\n\n"
        f"Respond with ONLY a valid JSON object, nothing else:\n"
        f"{{\"action_type\": \"<one of the actions above>\", \"target\": \"...\", "
        f"\"parameters\": {{}}, \"reasoning\": \"...\", \"message\": \"role: message\"}}"
    )
    return ROLE_PROMPTS[role] + json_instruction


# ── Inference backends ────────────────────────────────────────────────────

def infer_vllm(role: str, system_prompt: str, user_msg: str,
               base_url: str, model_name: str) -> str:
    """Run inference via vLLM OpenAI-compatible endpoint."""
    from openai import OpenAI
    client = OpenAI(base_url=f"{base_url}/v1", api_key="dummy")
    resp = client.chat.completions.create(
        model=model_name,
        max_tokens=512,
        temperature=0.7,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg},
        ],
    )
    return resp.choices[0].message.content or ""


def infer_local(role: str, system_prompt: str, user_msg: str,
                model, tokenizer) -> str:
    """Run inference locally with a loaded model."""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_msg},
    ]
    input_text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(input_text, return_tensors="pt").to(model.device)
    import torch
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=512,
            temperature=0.7,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id,
        )
    new_tokens = outputs[0][inputs["input_ids"].shape[1]:]
    return tokenizer.decode(new_tokens, skip_special_tokens=True)


def load_hf_model(hf_repo: str, role: str, step: int = 1):
    """Pull LoRA from HuggingFace and load with base model."""
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel
    from huggingface_hub import snapshot_download
    import torch

    base_model_name = "Qwen/Qwen3.5-0.8B"

    # Download LoRA adapter from HF
    subfolder = f"{role}/step-{step}"
    print(f"   Downloading LoRA: {hf_repo}/{subfolder}")
    try:
        adapter_path = snapshot_download(
            hf_repo,
            allow_patterns=[f"{subfolder}/*"],
            local_dir=f"/tmp/office_os_demo_lora/{role}",
        )
        adapter_path = os.path.join(adapter_path, subfolder)
    except Exception as e:
        print(f"   !! Failed to download LoRA for {role}: {e}")
        return None, None

    if not os.path.exists(os.path.join(adapter_path, "adapter_config.json")):
        print(f"   !! No adapter found at {adapter_path}")
        return None, None

    print(f"   Loading base model: {base_model_name}")
    tokenizer = AutoTokenizer.from_pretrained(base_model_name, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        base_model_name,
        torch_dtype=torch.bfloat16,
        device_map="auto",
        trust_remote_code=True,
    )

    print(f"   Applying LoRA adapter...")
    model = PeftModel.from_pretrained(model, adapter_path)
    model.eval()
    print(f"   Model ready for {role}")
    return model, tokenizer


def parse_response(text: str) -> dict | None:
    """Try to parse JSON from model output."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)
    start = text.find("{")
    end = text.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError:
            pass
    return None


def print_result(role: str, raw: str, label: str = ""):
    """Pretty-print an agent response."""
    prefix = f"[{label}] " if label else ""
    parsed = parse_response(raw)
    if parsed:
        action = parsed.get("action_type", "???")
        target = parsed.get("target", "")
        reasoning = parsed.get("reasoning", "")
        message = parsed.get("message", "")
        valid = action in ROLE_ACTIONS.get(role, [])
        validity = "✓" if valid else "✗ INVALID"

        print(f"  {prefix}Action:    {action} ({validity})")
        print(f"  {prefix}Target:    {target}")
        print(f"  {prefix}Reasoning: {reasoning}")
        if message:
            print(f"  {prefix}Message:   {message}")
    else:
        print(f"  {prefix}Raw output (failed to parse):")
        print(f"  {raw[:300]}")


# ── Main ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Office OS Fine-Tuned Inference Demo")
    parser.add_argument("--vllm", type=str, default="",
                        help="vLLM endpoint URL (e.g. https://vllm--...code.run)")
    parser.add_argument("--hf-repo", type=str, default="",
                        help="HuggingFace repo with LoRA adapters")
    parser.add_argument("--step", type=int, default=1,
                        help="Training step to load from HF (default: 1)")
    parser.add_argument("--roles", nargs="*", default=ALL_ROLES,
                        help="Roles to demo (default: all)")
    parser.add_argument("--compare", action="store_true",
                        help="Compare base model vs fine-tuned side by side")
    parser.add_argument("--base-model", type=str, default="Qwen/Qwen3.5-0.8B",
                        help="Base model name")
    args = parser.parse_args()

    vllm_url = args.vllm or os.environ.get("NORTHFLANK_INFERENCE_ENDPOINT", "")
    hf_repo = args.hf_repo or os.environ.get("HF_REPO", "")

    if not vllm_url and not hf_repo:
        print("Error: specify --vllm <url> or --hf-repo <repo>")
        print("  --vllm   : use Northflank vLLM with hot-loaded LoRAs")
        print("  --hf-repo: pull LoRAs from HuggingFace for local inference")
        sys.exit(1)

    mode = "vllm" if vllm_url else "local"

    print("=" * 60)
    print("  OFFICE OS — Fine-Tuned Agent Demo")
    print("=" * 60)
    print(f"  Mode:       {'vLLM endpoint' if mode == 'vllm' else 'Local (HF LoRA)'}")
    if mode == "vllm":
        print(f"  Endpoint:   {vllm_url}")
    else:
        print(f"  HF Repo:    {hf_repo}")
        print(f"  Step:       {args.step}")
    print(f"  Base Model: {args.base_model}")
    print(f"  Roles:      {', '.join(args.roles)}")
    print(f"  Compare:    {'yes' if args.compare else 'no'}")
    print("=" * 60)
    print()

    # Check vLLM health if using endpoint
    if mode == "vllm":
        print(">> Checking vLLM endpoint...")
        try:
            from openai import OpenAI
            client = OpenAI(base_url=f"{vllm_url}/v1", api_key="dummy")
            models = client.models.list()
            available = [m.id for m in models.data]
            print(f"   Available models: {available}")

            # Check which roles have LoRAs loaded
            lora_models = [m for m in available if m.startswith("office-os-")]
            base_models = [m for m in available if not m.startswith("office-os-")]
            if lora_models:
                print(f"   Fine-tuned LoRAs: {lora_models}")
            else:
                print(f"   No LoRAs loaded — will use base model: {base_models}")
            print()
        except Exception as e:
            print(f"   !! Cannot reach vLLM: {e}")
            sys.exit(1)

    # For local mode, we load models per-role
    local_models: dict = {}

    # Run inference for each role
    for role in args.roles:
        if role not in ALL_ROLES:
            print(f">> Skipping unknown role: {role}")
            continue

        print(f"{'─' * 60}")
        print(f"  ROLE: {role.upper()}")
        print(f"{'─' * 60}")

        system_prompt = build_system_prompt(role)
        user_msg = build_demo_prompt(role)

        # ── Fine-tuned inference ──────────────────────────────────
        print(f"\n  >> Fine-tuned model:")
        t0 = time.time()

        if mode == "vllm":
            lora_name = f"office-os-{role}"
            # Check if LoRA is loaded, fall back to base
            try:
                raw = infer_vllm(role, system_prompt, user_msg, vllm_url, lora_name)
            except Exception:
                print(f"     (LoRA '{lora_name}' not loaded, using base model)")
                raw = infer_vllm(role, system_prompt, user_msg, vllm_url, args.base_model)
        else:
            if role not in local_models:
                model, tokenizer = load_hf_model(hf_repo, role, args.step)
                if model is None:
                    print(f"     !! Skipping {role} — no LoRA available")
                    continue
                local_models[role] = (model, tokenizer)
            model, tokenizer = local_models[role]
            raw = infer_local(role, system_prompt, user_msg, model, tokenizer)

        elapsed = time.time() - t0
        print_result(role, raw, label="FINE-TUNED")
        print(f"  Time: {elapsed:.1f}s")

        # ── Base model comparison ─────────────────────────────────
        if args.compare:
            print(f"\n  >> Base model (no LoRA):")
            t0 = time.time()

            if mode == "vllm":
                raw_base = infer_vllm(role, system_prompt, user_msg, vllm_url, args.base_model)
            else:
                # Would need to load base model separately — skip for now
                print(f"     (base model comparison only supported in vLLM mode)")
                raw_base = None

            if raw_base:
                elapsed = time.time() - t0
                print_result(role, raw_base, label="BASE")
                print(f"  Time: {elapsed:.1f}s")

        print()

    print("=" * 60)
    print("  Demo complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
