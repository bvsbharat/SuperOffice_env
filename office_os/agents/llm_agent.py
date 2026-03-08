"""LLM-powered agent using vLLM-served models or Claude for structured decisions.

Modes:
  1. vLLM model (Qwen + LoRA on Northflank GPU) — primary, uses JSON prompting
  2. Claude (Anthropic API) — alternative mode
"""

from __future__ import annotations

import json
import logging
import os
from typing import Optional

from pydantic import BaseModel, Field

from .base_agent import BaseAgent
from .prompts import ROLE_PROMPTS

logger = logging.getLogger(__name__)


# ── Structured output models ─────────────────────────────────────────

class AgentAction(BaseModel):
    """Structured action output from the LLM agent."""
    action_type: str = Field(description="Action to take, must be from the allowed actions list")
    target: str = Field(default="", description="What the action applies to")
    parameters: dict = Field(default_factory=dict, description="Action-specific parameters")
    reasoning: str = Field(default="", description="Brief explanation of why this action")
    message: Optional[str] = Field(default=None, description="Optional message to another agent: 'role: text'")


class ReflectionOutput(BaseModel):
    """Structured reflection output."""
    insights: list[str] = Field(description="1-3 concise insights from recent events")


def _get_client(provider: str = "anthropic", aws_region: str = "us-east-1"):
    """Lazy-load the Anthropic client."""
    try:
        import anthropic
    except ImportError:
        raise ImportError("anthropic is required. Install with: pip install anthropic")
    return anthropic.Anthropic()


def _get_openai_client(base_url: str, api_key: str):
    """Create an OpenAI-compatible client for vLLM."""
    try:
        from openai import OpenAI
    except ImportError:
        raise ImportError("openai is required for vLLM models. Install with: pip install openai")
    return OpenAI(base_url=base_url, api_key=api_key)


# ── LLM Agent ────────────────────────────────────────────────────────

class LLMAgent:
    """
    Agent that uses vLLM-served models or Claude for decisions.

    Two separate modes (set at init, no automatic switching):
      - vLLM (Northflank GPU): set via set_vllm_endpoint()
      - Claude (Anthropic): default if no vLLM endpoint set
    """

    def __init__(self, role: str, model: str = "claude-sonnet-4-20250514",
                 provider: str = "anthropic", aws_region: str = "us-east-1"):
        self.role = role
        self.model = model
        self.provider = provider
        self.aws_region = aws_region
        self.base = BaseAgent(role=role)
        self.system_prompt = ROLE_PROMPTS[role]
        self._client = None
        self._openai_client = None

        # vLLM endpoint config
        self._vllm_endpoint: dict | None = None  # {base_url, api_key, model_name}
        self.use_vllm = False

        # Import role actions for validation
        from market.config import ROLE_ACTIONS
        self._allowed_actions = ROLE_ACTIONS.get(role, [])

        # Track last user message for trajectory collection
        self.last_user_message: str = ""

    def set_vllm_endpoint(self, base_url: str, api_key: str, model_name: str):
        """Configure the vLLM endpoint (e.g. Northflank GPU)."""
        self._vllm_endpoint = {
            "base_url": base_url,
            "api_key": api_key,
            "model_name": model_name,
        }
        self._openai_client = None
        self.use_vllm = True
        logger.info(f"{self.role}: Using vLLM at {base_url} ({model_name})")

    def clear_vllm_endpoint(self):
        """Revert to Claude for inference."""
        self._vllm_endpoint = None
        self._openai_client = None
        self.use_vllm = False

    @property
    def client(self):
        if self._client is None:
            self._client = _get_client(self.provider, self.aws_region)
        return self._client

    @property
    def openai_client(self):
        if self._openai_client is None and self._vllm_endpoint:
            self._openai_client = _get_openai_client(
                self._vllm_endpoint["base_url"],
                self._vllm_endpoint["api_key"],
            )
        return self._openai_client

    def decide(self, observation: dict, turn: int) -> dict:
        """Decide on an action given an observation. Returns a validated action dict."""
        summary = self._summarize_observation(observation)
        self.base.observe(turn, summary, importance=5.0)

        user_msg = self._build_user_message(observation, turn)
        self.last_user_message = user_msg

        mode = "vLLM" if self.use_vllm else "Claude"

        action = None
        rejected_actions: list[str] = []
        max_attempts = 8
        for attempt in range(max_attempts):
            try:
                if self.use_vllm:
                    action = self._call_vllm(user_msg, rejected_actions=rejected_actions)
                else:
                    action = self._call_structured(user_msg)
                if action.action_type not in self._allowed_actions:
                    rejected_actions.append(action.action_type)
                    logger.warning(f"{self.role} picked invalid '{action.action_type}', retrying ({attempt+1}/{max_attempts})...")
                    action = None
                    continue
                break
            except Exception as e:
                logger.warning(f"{mode} attempt {attempt+1}/{max_attempts} for {self.role}: {type(e).__name__}: {e}")
                import traceback
                logger.warning(traceback.format_exc())
                if attempt < max_attempts - 1:
                    import time
                    time.sleep(2)

        # Last resort: pick the first allowed action rather than crashing
        if action is None:
            fallback_action = self._allowed_actions[0]
            logger.warning(f"{self.role}: all {max_attempts} attempts failed, using fallback action '{fallback_action}'")
            action = AgentAction(
                action_type=fallback_action,
                target="auto",
                reasoning="Fallback action after failed attempts",
            )

        result = action.model_dump()
        self.base.plan(turn, f"{result['action_type']} -> {result['target']}: {result.get('reasoning', '')}")
        return result

    def _call_vllm(self, user_msg: str, rejected_actions: list[str] | None = None) -> AgentAction:
        """Call vLLM model via OpenAI-compatible endpoint.

        Uses plain JSON prompting (no tools/function-calling) for maximum
        compatibility with vLLM + Qwen models. Includes strong role constraints
        to prevent the small model from picking actions from other roles.
        """
        actions_list = "\n".join(f"  - {a}" for a in self._allowed_actions)
        json_instruction = (
            f"\n\n## CRITICAL INSTRUCTIONS\n"
            f"You are the **{self.role}** agent. You can ONLY use these actions:\n"
            f"{actions_list}\n\n"
            f"Do NOT use actions from other roles. Any action not listed above is INVALID.\n\n"
            f"Respond with ONLY a valid JSON object, nothing else:\n"
            f"{{\"action_type\": \"<one of the actions above>\", \"target\": \"...\", "
            f"\"parameters\": {{}}, \"reasoning\": \"...\", \"message\": \"role: message\"}}"
        )

        if rejected_actions:
            unique_rejected = list(dict.fromkeys(rejected_actions))
            json_instruction += (
                f"\n\nWARNING: These actions are INVALID and were already rejected: "
                f"{', '.join(unique_rejected)}. Do NOT use them."
            )

        response = self.openai_client.chat.completions.create(
            model=self._vllm_endpoint["model_name"],
            max_tokens=512,
            temperature=0.7,
            messages=[
                {"role": "system", "content": self.system_prompt + json_instruction},
                {"role": "user", "content": user_msg},
            ],
        )

        text = response.choices[0].message.content or ""
        return self._parse_text_response(text)

    def _call_structured(self, user_msg: str) -> AgentAction:
        """Call Claude and parse response into a validated AgentAction."""
        tool_schema = AgentAction.model_json_schema()
        properties = tool_schema.get("properties", {})

        response = self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            system=self.system_prompt,
            messages=[{"role": "user", "content": user_msg}],
            tools=[{
                "name": "submit_action",
                "description": f"Submit your chosen action. action_type MUST be one of: {', '.join(self._allowed_actions)}",
                "input_schema": {
                    "type": "object",
                    "properties": properties,
                    "required": ["action_type"],
                },
            }],
            tool_choice={"type": "tool", "name": "submit_action"},
        )

        for block in response.content:
            if block.type == "tool_use" and block.name == "submit_action":
                return AgentAction.model_validate(block.input)

        for block in response.content:
            if hasattr(block, "text") and block.text:
                return self._parse_text_response(block.text)

        raise ValueError("No valid action in Claude response")

    def _parse_text_response(self, raw: str) -> AgentAction:
        """Parse a text response into AgentAction."""
        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            text = "\n".join(lines)

        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            data = json.loads(text[start:end])
            return AgentAction.model_validate(data)

        raise ValueError(f"Could not parse action from text: {text[:200]}")

    def reflect(self, turn: int, observation: dict):
        """Trigger a reflection cycle."""
        context = self.base.get_context(turn)
        memories = context["relevant_memories"]
        if len(memories) < 3:
            return

        memory_text = "\n".join(f"- {m['description']}" for m in memories[:10])

        if self.use_vllm and self._vllm_endpoint:
            try:
                response = self.openai_client.chat.completions.create(
                    model=self._vllm_endpoint["model_name"],
                    max_tokens=256,
                    messages=[
                        {"role": "system", "content": "You are a startup agent reflecting on recent events."},
                        {"role": "user", "content": f"Recent events:\n{memory_text}\n\nProvide 1-3 concise insights as a JSON object with an 'insights' array of strings."},
                    ],
                )
                text = response.choices[0].message.content or ""
                start = text.find("{")
                end = text.rfind("}") + 1
                if start >= 0 and end > start:
                    data = json.loads(text[start:end])
                    result = ReflectionOutput.model_validate(data)
                    self.base.reflect(turn, result.insights)
                return
            except Exception as e:
                logger.debug(f"vLLM reflection failed for {self.role}: {e}")
                return

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=256,
                system="You are a startup agent reflecting on recent events.",
                messages=[{"role": "user", "content": f"Recent events:\n{memory_text}\n\nProvide 1-3 concise insights."}],
                tools=[{
                    "name": "submit_reflections",
                    "description": "Submit your reflections as a list of insight strings",
                    "input_schema": {
                        "type": "object",
                        "properties": {
                            "insights": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "1-3 concise insights",
                            }
                        },
                        "required": ["insights"],
                    },
                }],
                tool_choice={"type": "tool", "name": "submit_reflections"},
            )
            for block in response.content:
                if block.type == "tool_use" and block.name == "submit_reflections":
                    result = ReflectionOutput.model_validate(block.input)
                    self.base.reflect(turn, result.insights)
                    return
        except Exception as e:
            logger.debug(f"Reflection failed for {self.role}: {e}")

    def _build_user_message(self, obs: dict, turn: int) -> str:
        """Build the context message sent to the LLM."""
        context = self.base.get_context(turn)
        role_data = obs.get("role_data", {})

        parts = [
            f"=== Day {obs.get('day', '?')} | Phase: {obs.get('phase', '?')} | Turn {turn} ===",
            "",
            "## Your KPIs",
            json.dumps(obs.get("kpis", {}), indent=2),
            "",
            f"Budget remaining: ${obs.get('budget_remaining', 0):,.0f}",
            "",
        ]

        if self.role == "dev":
            in_progress = role_data.get("features_in_progress", [])
            ready = [f for f in in_progress if f.get("turns_remaining", 99) <= 0]
            if ready:
                parts.append(f"!! URGENT: {len(ready)} feature(s) ready to ship! Use SHIP_RELEASE now!")
                parts.append("")
            elif in_progress:
                building = in_progress[0]
                parts.append(f">> Currently building: {building['name']} ({building['turns_remaining']} turns left)")
                parts.append("")
        elif self.role == "sales":
            pipeline = role_data.get("pipeline", [])
            if pipeline:
                parts.append(">> PIPELINE STATUS:")
                for c in pipeline:
                    parts.append(f"   {c['name']}: stage={c['stage']}, budget=${c.get('budget', 0):,.0f}, days_since_contact={c.get('days_since_contact', 0)}")
                parts.append("")
            else:
                parts.append(">> Pipeline is empty. Use COLLECT_FEEDBACK while waiting for leads.")
                parts.append("")
        elif self.role == "content":
            team_status = role_data.get("team_status", {})
            shipped = team_status.get("dev", {}).get("shipped", [])
            if shipped:
                parts.append(f">> SHIPPED FEATURES (safe for case studies): {', '.join(shipped)}")
            else:
                parts.append(">> NO SHIPPED FEATURES YET — do NOT use WRITE_CASE_STUDY. Use WRITE_BLOG or WRITE_SOCIAL_POST instead.")
            parts.append("")

        shared_mem = role_data.pop("shared_memory", [])
        if shared_mem:
            parts.append("## SHARED TEAM MEMORY (all agents see this)")
            for entry in shared_mem[-10:]:
                parts.append(f"  [{entry.get('author', '?')}] ({entry.get('type', '?')}) {entry.get('content', '')}")
            parts.append("")

        messages = obs.get("messages", [])
        if messages:
            parts.append("## Team channel (recent messages)")
            for m in messages:
                parts.append(f"  {m.get('from', '?')} -> {m.get('to', 'all')}: {m.get('content', '')}")
            parts.append("")

        events = obs.get("events", [])
        if events:
            parts.append("## Active Events")
            for e in events:
                parts.append(f"  - {e.get('name', '?')}: {e.get('description', '')}")
            parts.append("")

        recent = obs.get("recent_actions", [])
        if recent:
            parts.append("## Recent team actions")
            for a in recent[-5:]:
                parts.append(f"  [{a.get('agent_id')}] {a.get('action_type')} -> {a.get('detail', '')}")
            parts.append("")

        if role_data:
            parts.append("## Your role data")
            parts.append(json.dumps(role_data, indent=2, default=str))
            parts.append("")

        if context.get("current_plan"):
            parts.append(f"## Your current plan: {context['current_plan']}")
        reflections = context.get("recent_reflections", [])
        if reflections:
            parts.append("## Your recent reflections")
            for r in reflections:
                parts.append(f"  - {r}")
            parts.append("")

        available = role_data.get("available_actions", [])
        if available:
            parts.append(f"## ALLOWED ACTIONS: {', '.join(available)}")
            parts.append("")

        parts.append("Pick the HIGHEST IMPACT action. Use the submit_action tool to respond.")
        return "\n".join(parts)

    def _summarize_observation(self, obs: dict) -> str:
        """Create a brief text summary of an observation for memory."""
        kpis = obs.get("kpis", {})
        day = obs.get("day", "?")
        phase = obs.get("phase", "?")
        result = obs.get("last_action_result", {})
        detail = result.get("detail", "no action yet")
        return f"Day {day} ({phase}): {detail}. KPIs: revenue=${kpis.get('revenue', 0)}, traffic={kpis.get('website_traffic', 0)}"
