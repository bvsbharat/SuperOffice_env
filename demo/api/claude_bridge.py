"""
Claude Bridge — generates agent reasoning text via AWS Bedrock.

Uses Claude Haiku on Bedrock for fast, cheap real-time generation.
Falls back to template strings if credentials are unavailable.

Required env vars:
    AWS_ACCESS_KEY_ID
    AWS_SECRET_ACCESS_KEY
    AWS_REGION               (default: us-east-1)

Optional env vars:
    BEDROCK_MODEL_ID         (default: us.anthropic.claude-3-5-haiku-20241022-v1:0)
"""

from __future__ import annotations

import os
import asyncio
import json
from typing import Any

try:
    import boto3
    import botocore.exceptions
    _HAS_BOTO3 = True
except ImportError:
    _HAS_BOTO3 = False

# ─── Config ───────────────────────────────────────────────────────────────────

DEFAULT_MODEL_ID = "us.anthropic.claude-sonnet-4-6-v1:0"
DEFAULT_REGION   = "us-east-1"

# ─── Template fallbacks ───────────────────────────────────────────────────────

REASONING_TEMPLATES: dict[str, str] = {
    "ceo":       "Given {phase} phase with MRR at ${mrr:,.0f}, I'm focusing on {task} to hit our Q1 targets.",
    "hr":        "Team capacity at {headcount} with MQL pipeline of {mql}. Executing {task} to scale GTM.",
    "marketing": "Current MQL count: {mql}. Launching {task} to drive qualified pipeline for Sales.",
    "content":   "NPS sitting at {nps:.0f}. Shipping {task} to build brand credibility and lower CAC.",
    "dev":       "Win rate at {win_rate:.0%}. Completing {task} to improve product-market fit.",
    "sales":     "{mql} MQLs in queue, win rate {win_rate:.0%}. Working {task} to close revenue.",
    "scene":     "Pipeline efficiency scan complete. Running {task} to optimize conversion funnel.",
    "customer":  "Satisfaction signal: NPS {nps:.0f}. Submitting {task} to guide product direction.",
}

HANDOFF_TEMPLATES: dict[str, str] = {
    "marketing→sales":   "Marketing to Sales: {mql} qualified leads ready, focus on enterprise tier.",
    "content→marketing": "Content to Marketing: new asset available — use in email sequences.",
    "dev→sales":         "Dev to Sales: feature shipped and stable, clear for demo next sprint.",
    "sales→customer":    "Sales to Customer: contract moving forward, ETA next week.",
    "scene→marketing":   "Scene to Marketing: lead routing automated, expect 15% lift in speed-to-lead.",
    "hr→dev":            "HR to Dev: new senior engineer starts Monday, sprint velocity up.",
    "ceo→hr":            "CEO to HR: board approved +3 headcount for sales pod.",
    "customer→ceo":      "Customer to CEO: product-market fit signal positive, expansion likely.",
}


# ─── Client singleton ─────────────────────────────────────────────────────────

_bedrock_client: Any = None


def _get_client() -> Any:
    """Return a boto3 bedrock-runtime client, or None if credentials missing."""
    global _bedrock_client
    if not _HAS_BOTO3:
        return None
    if _bedrock_client is not None:
        return _bedrock_client

    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or DEFAULT_REGION

    # boto3 picks up credentials from env vars (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY),
    # ~/.aws/credentials, or IAM instance roles automatically.
    # We only skip if neither env vars nor a profile seem to exist.
    access_key = os.environ.get("AWS_ACCESS_KEY_ID")
    secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY")

    try:
        session = boto3.Session(
            aws_access_key_id=access_key or None,
            aws_secret_access_key=secret_key or None,
            region_name=region,
        )
        _bedrock_client = session.client("bedrock-runtime")
        return _bedrock_client
    except Exception:
        return None


# ─── Core invocation (sync, called from async via executor) ───────────────────

def _invoke_bedrock(system_prompt: str, user_prompt: str) -> str:
    """Invoke Claude on Bedrock using the Messages API (converse-style body)."""
    client = _get_client()
    if client is None:
        raise RuntimeError("No Bedrock client available")

    model_id = os.environ.get("BEDROCK_MODEL_ID", DEFAULT_MODEL_ID)

    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 120,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }

    response = client.invoke_model(
        modelId=model_id,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(body),
    )

    result = json.loads(response["body"].read())
    return result["content"][0]["text"].strip()


# ─── Main callable ────────────────────────────────────────────────────────────

async def get_agent_reasoning(
    agent_id: str,
    task: str,
    kpis: dict,
    phase: str,
    scenario: str,
    step: int,
) -> str:
    """
    Generate 1-2 sentence agent reasoning text for speech bubbles / conversation log.
    Uses Claude Haiku on AWS Bedrock; falls back to templates if unavailable.
    """
    if not _HAS_BOTO3 or _get_client() is None:
        return _template_fallback(agent_id, task, kpis, phase)

    system_prompt = (
        "You are simulating an AI agent in a startup go-to-market RL environment. "
        "Respond as the agent with 1-2 concise sentences of internal reasoning or action description. "
        "Be specific about metrics and tasks. No markdown, no emojis, plain text only."
    )
    user_prompt = (
        f"Agent: {agent_id}\n"
        f"Phase: {phase}\n"
        f"Task: {task}\n"
        f"Scenario: {scenario}\n"
        f"Step: {step}/24\n"
        f"KPIs: MRR=${kpis.get('mrr', 0):,.0f}, MQL={kpis.get('mql', 0)}, "
        f"CAC=${kpis.get('cac', 0):.0f}, NPS={kpis.get('nps', 0):.0f}, "
        f"Win Rate={kpis.get('win_rate', 0):.0%}\n\n"
        "Describe your reasoning for this action in 1-2 sentences."
    )

    try:
        # boto3 is synchronous — run in a thread pool to avoid blocking the event loop
        loop = asyncio.get_event_loop()
        text = await loop.run_in_executor(None, _invoke_bedrock, system_prompt, user_prompt)
        return text
    except Exception:
        return _template_fallback(agent_id, task, kpis, phase)


async def get_batch_reasoning(
    agents_context: list[dict],
) -> dict[str, str]:
    """
    Generate reasoning for multiple agents concurrently (used at phase start).
    Returns {agent_id: reasoning_text}
    """
    tasks = [
        get_agent_reasoning(
            agent_id=ctx["agent_id"],
            task=ctx["task"],
            kpis=ctx["kpis"],
            phase=ctx["phase"],
            scenario=ctx["scenario"],
            step=ctx["step"],
        )
        for ctx in agents_context
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return {
        ctx["agent_id"]: (
            r if isinstance(r, str)
            else _template_fallback(ctx["agent_id"], ctx["task"], ctx["kpis"], ctx["phase"])
        )
        for ctx, r in zip(agents_context, results)
    }


def _template_fallback(agent_id: str, task: str, kpis: dict, phase: str) -> str:
    tmpl = REASONING_TEMPLATES.get(agent_id, "Executing {task} in {phase} phase.")
    try:
        return tmpl.format(
            task=task,
            phase=phase,
            mrr=kpis.get("mrr", 0),
            mql=kpis.get("mql", 0),
            nps=kpis.get("nps", 0),
            win_rate=kpis.get("win_rate", 0),
            cac=kpis.get("cac", 0),
            headcount=12,
        )
    except Exception:
        return f"Executing {task} during {phase} phase."
