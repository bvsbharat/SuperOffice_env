"""LLM-powered agent that uses Anthropic Claude to make decisions."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from .base_agent import BaseAgent
from .prompts import ROLE_PROMPTS

logger = logging.getLogger(__name__)


def _get_client():
    """Lazy-load Anthropic client."""
    try:
        import anthropic
        return anthropic.Anthropic()
    except ImportError:
        raise ImportError("anthropic is required for LLM agents. Install with: pip install anthropic")


class LLMAgent:
    """
    An agent that uses Claude to decide actions based on observations.

    Wraps BaseAgent (memory/reflection) with LLM decision-making.
    Each call to decide() sends the observation context to Claude and
    parses the response into a valid action dict.
    """

    def __init__(self, role: str, model: str = "claude-sonnet-4-20250514"):
        self.role = role
        self.model = model
        self.base = BaseAgent(role=role)
        self.system_prompt = ROLE_PROMPTS[role]
        self._client = None

    @property
    def client(self):
        if self._client is None:
            self._client = _get_client()
        return self._client

    def decide(self, observation: dict, turn: int) -> dict:
        """
        Given an observation from the environment, decide on an action.

        Returns a dict with: action_type, target, parameters, reasoning, message
        """
        # Store observation in memory
        summary = self._summarize_observation(observation)
        self.base.observe(turn, summary, importance=5.0)

        # Build the user message from the observation
        user_msg = self._build_user_message(observation, turn)

        # Call Claude
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=512,
                system=self.system_prompt,
                messages=[{"role": "user", "content": user_msg}],
            )
            raw_text = response.content[0].text.strip()
            action = self._parse_action(raw_text)
        except Exception as e:
            logger.warning(f"LLM call failed for {self.role}: {e}")
            action = self._fallback_action(observation)

        # Store the decision as a plan
        self.base.plan(turn, f"{action['action_type']} -> {action['target']}: {action.get('reasoning', '')}")

        return action

    def reflect(self, turn: int, observation: dict):
        """Trigger a reflection cycle based on accumulated observations."""
        context = self.base.get_context(turn)
        memories = context["relevant_memories"]
        if len(memories) < 3:
            return

        memory_text = "\n".join(f"- {m['description']}" for m in memories[:10])
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=256,
                system="You are a startup agent reflecting on recent events. Produce 1-3 concise insights as a JSON array of strings.",
                messages=[{"role": "user", "content": f"Recent events:\n{memory_text}\n\nWhat are your key insights?"}],
            )
            raw = response.content[0].text.strip()
            # Try to parse as JSON array
            if raw.startswith("["):
                insights = json.loads(raw)
            else:
                insights = [raw]
            self.base.reflect(turn, insights)
        except Exception as e:
            logger.debug(f"Reflection failed for {self.role}: {e}")

    def _build_user_message(self, obs: dict, turn: int) -> str:
        """Build the context message sent to the LLM."""
        # Get memory context
        context = self.base.get_context(turn)

        parts = [
            f"=== Day {obs.get('day', '?')} | Phase: {obs.get('phase', '?')} | Turn {turn} ===",
            "",
            "## Your KPIs",
            json.dumps(obs.get("kpis", {}), indent=2),
            "",
            f"Budget remaining: ${obs.get('budget_remaining', 0):,.0f}",
            "",
        ]

        # Messages from other agents
        messages = obs.get("messages", [])
        if messages:
            parts.append("## Messages from teammates")
            for m in messages:
                parts.append(f"  {m.get('from', '?')}: {m.get('content', '')}")
            parts.append("")

        # Events
        events = obs.get("events", [])
        if events:
            parts.append("## Active Events")
            for e in events:
                parts.append(f"  - {e.get('name', '?')}: {e.get('description', '')}")
            parts.append("")

        # Recent actions by all agents
        recent = obs.get("recent_actions", [])
        if recent:
            parts.append("## Recent team actions")
            for a in recent[-5:]:
                parts.append(f"  [{a.get('agent_id')}] {a.get('action_type')} -> {a.get('detail', '')}")
            parts.append("")

        # Role-specific data
        role_data = obs.get("role_data", {})
        if role_data:
            parts.append("## Your role data")
            parts.append(json.dumps(role_data, indent=2, default=str))
            parts.append("")

        # Memory context
        if context.get("current_plan"):
            parts.append(f"## Your current plan: {context['current_plan']}")
        reflections = context.get("recent_reflections", [])
        if reflections:
            parts.append("## Your recent reflections")
            for r in reflections:
                parts.append(f"  - {r}")
            parts.append("")

        # Available actions reminder
        available = role_data.get("available_actions", [])
        if available:
            parts.append(f"## Available actions: {', '.join(available)}")
            parts.append("")

        parts.append("Respond with a single JSON action object. No markdown fences.")
        return "\n".join(parts)

    def _parse_action(self, raw: str) -> dict:
        """Parse LLM response into an action dict."""
        # Strip markdown fences if present
        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            text = "\n".join(lines)

        try:
            action = json.loads(text)
        except json.JSONDecodeError:
            # Try to extract JSON from the text
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                action = json.loads(text[start:end])
            else:
                raise ValueError(f"Could not parse action from: {text[:200]}")

        # Validate required fields
        if "action_type" not in action:
            raise ValueError("Missing action_type in response")

        return {
            "action_type": action["action_type"],
            "target": action.get("target", ""),
            "parameters": action.get("parameters", {}),
            "reasoning": action.get("reasoning", ""),
            "message": action.get("message"),
        }

    def _fallback_action(self, obs: dict) -> dict:
        """Return a safe fallback action if LLM fails."""
        fallbacks = {
            "dev": {"action_type": "REFACTOR", "target": "", "parameters": {}, "reasoning": "LLM unavailable, refactoring", "message": None},
            "marketing": {"action_type": "OPTIMIZE_FUNNEL", "target": "", "parameters": {}, "reasoning": "LLM unavailable, optimizing", "message": None},
            "sales": {"action_type": "FOLLOW_UP", "target": "", "parameters": {}, "reasoning": "LLM unavailable, following up", "message": None},
            "content": {"action_type": "WRITE_BLOG", "target": "Startup Tips", "parameters": {"topic": "general"}, "reasoning": "LLM unavailable, writing generic content", "message": None},
        }
        return fallbacks.get(self.role, fallbacks["dev"])

    def _summarize_observation(self, obs: dict) -> str:
        """Create a brief text summary of an observation for memory."""
        kpis = obs.get("kpis", {})
        day = obs.get("day", "?")
        phase = obs.get("phase", "?")
        result = obs.get("last_action_result", {})
        detail = result.get("detail", "no action yet")
        return f"Day {day} ({phase}): {detail}. KPIs: revenue=${kpis.get('revenue', 0)}, traffic={kpis.get('website_traffic', 0)}"
