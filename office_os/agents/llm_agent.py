"""LLM-powered agent using Pydantic AI for structured, reliable decisions."""

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


# ── Bedrock/Anthropic model name helper ──────────────────────────────

def _build_model_name(model: str, provider: str, aws_region: str) -> str:
    """Build the pydantic-ai model string."""
    if provider == "bedrock":
        # pydantic-ai uses 'bedrock:model-id' format
        # but we'll use anthropic directly with our own client
        return model
    return model


def _get_client(provider: str = "anthropic", aws_region: str = "us-east-1"):
    """Lazy-load the appropriate Anthropic client."""
    try:
        import anthropic
    except ImportError:
        raise ImportError("anthropic is required. Install with: pip install anthropic")

    if provider == "bedrock":
        access_key = os.environ.get("AWS_ACCESS_KEY_ID")
        secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY")
        session_token = os.environ.get("AWS_SESSION_TOKEN")

        kwargs = {"aws_region": aws_region}
        if access_key:
            kwargs["aws_access_key"] = access_key
        if secret_key:
            kwargs["aws_secret_key"] = secret_key
        if session_token:
            kwargs["aws_session_token"] = session_token

        return anthropic.AnthropicBedrock(**kwargs)
    return anthropic.Anthropic()


# ── LLM Agent ────────────────────────────────────────────────────────

class LLMAgent:
    """
    Agent that uses Claude + Pydantic structured output for reliable decisions.

    Uses Pydantic models to validate LLM output, with automatic retry
    and fallback. Supports both Anthropic API and AWS Bedrock.
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

        # Import role actions for validation
        from market.config import ROLE_ACTIONS
        self._allowed_actions = ROLE_ACTIONS.get(role, [])

    @property
    def client(self):
        if self._client is None:
            self._client = _get_client(self.provider, self.aws_region)
        return self._client

    def decide(self, observation: dict, turn: int) -> dict:
        """Decide on an action given an observation. Returns a validated action dict."""
        # Store observation in memory
        summary = self._summarize_observation(observation)
        self.base.observe(turn, summary, importance=5.0)

        # Build prompt
        user_msg = self._build_user_message(observation, turn)

        # Call LLM with structured output + retry
        action = None
        for attempt in range(3):
            try:
                action = self._call_structured(user_msg)
                # Validate action is allowed for this role
                if action.action_type not in self._allowed_actions:
                    logger.warning(f"{self.role} picked invalid '{action.action_type}', retrying...")
                    action = None
                    continue
                break
            except Exception as e:
                logger.warning(f"LLM attempt {attempt+1}/3 for {self.role}: {type(e).__name__}: {e}")
                if attempt < 2:
                    import time
                    time.sleep(1)

        if action is None:
            return self._fallback_action(observation)

        result = action.model_dump()

        # Store decision as plan
        self.base.plan(turn, f"{result['action_type']} -> {result['target']}: {result.get('reasoning', '')}")
        return result

    def _call_structured(self, user_msg: str) -> AgentAction:
        """Call Claude and parse response into a validated AgentAction."""
        # Build the tool schema from AgentAction
        tool_schema = AgentAction.model_json_schema()
        # Remove title/description that aren't needed in the properties
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

        # Extract tool use result
        for block in response.content:
            if block.type == "tool_use" and block.name == "submit_action":
                return AgentAction.model_validate(block.input)

        # Fallback: try parsing text response
        for block in response.content:
            if hasattr(block, "text") and block.text:
                return self._parse_text_response(block.text)

        raise ValueError("No valid action in LLM response")

    def _parse_text_response(self, raw: str) -> AgentAction:
        """Parse a text response into AgentAction (fallback if tool_use fails)."""
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
        """Trigger a reflection cycle using structured output."""
        context = self.base.get_context(turn)
        memories = context["relevant_memories"]
        if len(memories) < 3:
            return

        memory_text = "\n".join(f"- {m['description']}" for m in memories[:10])
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

        # Role-specific urgency hints
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

        # Shared memory board — the team's collective knowledge
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

    def _fallback_action(self, obs: dict) -> dict:
        """Return a smart fallback action based on current state."""
        role_data = obs.get("role_data", {})

        if self.role == "dev":
            # If features ready to ship, ship them
            in_progress = role_data.get("features_in_progress", [])
            ready = [f for f in in_progress if f.get("turns_remaining", 99) <= 0]
            if ready:
                return {"action_type": "SHIP_RELEASE", "target": "", "parameters": {}, "reasoning": "Features ready to ship", "message": None}
            # If building something, continue
            if in_progress:
                return {"action_type": "BUILD_FEATURE", "target": in_progress[0]["name"], "parameters": {}, "reasoning": "Continue building feature", "message": None}
            # Otherwise build from backlog
            backlog = role_data.get("backlog", [])
            target = backlog[0]["name"] if backlog else "SSO Integration"
            return {"action_type": "BUILD_FEATURE", "target": target, "parameters": {}, "reasoning": "Building from backlog", "message": None}

        elif self.role == "sales":
            # Advance the most advanced customer in pipeline
            pipeline = role_data.get("pipeline", [])
            stage_priority = {"negotiation": 0, "proposal": 1, "demo": 2, "qualified": 3, "lead": 4, "visitor": 5}
            pipeline_sorted = sorted(pipeline, key=lambda c: stage_priority.get(c.get("stage", "visitor"), 99))
            if pipeline_sorted:
                c = pipeline_sorted[0]
                stage_actions = {
                    "lead": "QUALIFY_LEAD",
                    "qualified": "RUN_DEMO",
                    "demo": "SEND_PROPOSAL",
                    "proposal": "CLOSE_DEAL",
                    "negotiation": "CLOSE_DEAL",
                }
                action = stage_actions.get(c["stage"], "FOLLOW_UP")
                params = {"contract_tier": "monthly"} if action == "CLOSE_DEAL" else {}
                return {"action_type": action, "target": c["name"], "parameters": params, "reasoning": f"Advancing {c['name']} from {c['stage']}", "message": None}
            return {"action_type": "COLLECT_FEEDBACK", "target": "general", "parameters": {"feedback": "market feedback"}, "reasoning": "No customers in pipeline", "message": None}

        elif self.role == "marketing":
            budget = obs.get("budget_remaining", 0)
            if budget >= 500:
                return {"action_type": "LAUNCH_CAMPAIGN", "target": "Growth Campaign", "parameters": {}, "reasoning": "Driving traffic for leads", "message": None}
            return {"action_type": "OPTIMIZE_FUNNEL", "target": "", "parameters": {}, "reasoning": "Free conversion optimization", "message": None}

        elif self.role == "ceo":
            return {"action_type": "REVIEW_STRATEGY", "target": "overall performance", "parameters": {}, "reasoning": "Reviewing company strategy", "message": None}

        elif self.role == "hr":
            return {"action_type": "PLAN_SPRINT", "target": "current priorities", "parameters": {}, "reasoning": "Planning team sprint", "message": None}

        elif self.role == "customer":
            return {"action_type": "EVALUATE_PRODUCT", "target": "", "parameters": {}, "reasoning": "Evaluating product quality", "message": None}

        else:  # content
            return {"action_type": "WRITE_BLOG", "target": "SaaS Growth Strategies", "parameters": {"topic": "growth"}, "reasoning": "Generating traffic and leads", "message": None}

    def _summarize_observation(self, obs: dict) -> str:
        """Create a brief text summary of an observation for memory."""
        kpis = obs.get("kpis", {})
        day = obs.get("day", "?")
        phase = obs.get("phase", "?")
        result = obs.get("last_action_result", {})
        detail = result.get("detail", "no action yet")
        return f"Day {day} ({phase}): {detail}. KPIs: revenue=${kpis.get('revenue', 0)}, traffic={kpis.get('website_traffic', 0)}"
