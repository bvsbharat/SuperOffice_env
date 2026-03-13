"""LLM-powered agent using vLLM-served models or Claude for structured decisions.

Enhanced with gstack-inspired patterns:
- Strategic mode injection (GROWTH/SURVIVAL/SPRINT)
- Phase-aware guidance
- Situation analysis summary
- Repetition detection warnings
- Event-driven reflection triggers

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

from models import ToolCall, ToolDefinition
from .base_agent import BaseAgent
from .prompts import ROLE_PROMPTS

logger = logging.getLogger(__name__)

_OUTPUT_TOKENS = 4096  # Qwen3.5-0.8B supports 262K context; generous output budget
_MAX_CONTEXT_TOKENS = 262144  # 262K — full native context of Qwen3.5-0.8B


def _count_tokens(text: str) -> int:
    """Estimate token count from text length. ~4 chars per token for English."""
    return len(text) // 4


# ── Tool definitions for agent tool-calling ───────────────────────────

AGENT_TOOLS = [
    ToolDefinition(
        name="update_sheets",
        description="Sync current KPIs and customer pipeline to Google Sheets dashboard",
        parameters={
            "sheet_type": {
                "type": "string",
                "enum": ["dashboard", "customers", "all"],
                "description": "Which sheet to update",
            },
        },
    ),
    ToolDefinition(
        name="create_invoice",
        description="Create an invoice sheet in Google Sheets for a closed deal",
        parameters={
            "customer_name": {
                "type": "string",
                "description": "Name of the customer who closed",
            },
        },
    ),
    ToolDefinition(
        name="github_update",
        description="Create or update a GitHub issue to track simulation progress",
        parameters={
            "action": {
                "type": "string",
                "enum": ["create_issue", "close_issue", "add_comment"],
                "description": "GitHub action to take",
            },
            "title": {
                "type": "string",
                "description": "Issue title (for create) or comment body (for add_comment)",
            },
            "issue_number": {
                "type": "integer",
                "description": "Issue number (for close/comment). Optional for create.",
            },
            "labels": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Labels to apply (for create)",
            },
        },
    ),
]


# ── Structured output models ─────────────────────────────────────────

class AgentAction(BaseModel):
    """Structured action output from the LLM agent."""
    action_type: str = Field(description="Action to take, must be from the allowed actions list")
    target: str = Field(default="", description="What the action applies to")
    parameters: dict = Field(default_factory=dict, description="Action-specific parameters")
    reasoning: str = Field(default="", description="Brief explanation of why this action")
    message: Optional[str] = Field(default=None, description="Optional message to another agent: 'role: text'")
    tool_calls: list[dict] = Field(default_factory=list, description="Optional tool calls (sheets, github, invoice)")


class ReflectionOutput(BaseModel):
    """Structured reflection output."""
    insights: list[str] = Field(description="1-3 concise insights from recent events")


def _get_client(provider: str = "anthropic", aws_region: str = "us-east-1"):
    """Lazy-load the Anthropic client (direct API or Bedrock)."""
    try:
        import anthropic
    except ImportError:
        raise ImportError("anthropic is required. Install with: pip install anthropic")
    if provider == "bedrock":
        return anthropic.AnthropicBedrock(aws_region=aws_region)
    return anthropic.Anthropic()


def _get_openai_client(base_url: str, api_key: str):
    """Create an OpenAI-compatible client for vLLM."""
    try:
        from openai import OpenAI
    except ImportError:
        raise ImportError("openai is required for vLLM models. Install with: pip install openai")
    return OpenAI(base_url=base_url, api_key=api_key)


# ── Phase guidance for each phase ─────────────────────────────────────

_PHASE_GUIDANCE = {
    "morning_standup": "PHASE: Morning standup. Read shared memory and messages. Assess what happened. Respond to teammate requests. Plan your day.",
    "execution": "PHASE: Execution. Take your highest-impact action NOW. This is where real work happens.",
    "review": "PHASE: Review. Reflect on what worked today. Flag blockers. Share status updates with teammates.",
    "planning": "PHASE: Planning. Set priorities for tomorrow. Coordinate with teammates on what's needed next.",
}


# ── Situation analysis helper ─────────────────────────────────────────

def _build_situation_analysis(kpis: dict, budget: float, mode: str, phase: str) -> str:
    """Build a concise situation analysis string for the agent."""
    lines = [f"## SITUATION ANALYSIS (Mode: {mode})"]

    # Key health indicators
    satisfaction = kpis.get("customer_satisfaction", 0)
    stability = kpis.get("product_stability", 0)
    revenue = kpis.get("revenue", 0)
    traffic = kpis.get("website_traffic", 0)

    alerts = []
    if budget < 3000:
        alerts.append("CRITICAL: Budget dangerously low")
    elif budget < 5000:
        alerts.append("Budget is low — conserve spending")
    if satisfaction < 0.3:
        alerts.append("CRITICAL: Customer satisfaction very low — churn imminent")
    elif satisfaction < 0.5:
        alerts.append("Customer satisfaction declining — prioritize quality")
    if stability < 0.5:
        alerts.append("CRITICAL: Product stability poor — fix bugs urgently")
    elif stability < 0.7:
        alerts.append("Product stability needs attention")
    if traffic < 500:
        alerts.append("Traffic is low — need marketing/content push")

    if alerts:
        lines.append("ALERTS:")
        for a in alerts:
            lines.append(f"  !! {a}")
    else:
        lines.append("Health: Good. All indicators stable.")

    # Phase guidance
    guidance = _PHASE_GUIDANCE.get(phase, "")
    if guidance:
        lines.append(guidance)

    lines.append("")
    return "\n".join(lines)


# ── LLM Agent ────────────────────────────────────────────────────────

class LLMAgent:
    """
    Agent that uses vLLM-served models or Claude for decisions.

    Enhanced with strategic mode awareness, phase-aware guidance,
    situation analysis, and event-driven reflection triggers.

    Two separate modes (set at init, no automatic switching):
      - vLLM (Northflank GPU): set via set_vllm_endpoint()
      - Claude (Anthropic): default if no vLLM endpoint set
    """

    # Bedrock model ID mapping
    BEDROCK_MODELS = {
        "claude-sonnet-4-20250514": "us.anthropic.claude-sonnet-4-20250514-v1:0",
        "claude-haiku-4-5-20251001": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    }

    def __init__(self, role: str, model: str = "claude-sonnet-4-20250514",
                 provider: str = "anthropic", aws_region: str = "us-east-1"):
        self.role = role
        self.provider = provider
        self.aws_region = aws_region
        # Resolve Bedrock model ID if needed
        if provider == "bedrock":
            self.model = self.BEDROCK_MODELS.get(model, model)
        else:
            self.model = model
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
        """Decide on an action given an observation. Returns a validated action dict.

        Enhanced: updates strategic mode, injects situation analysis, tracks actions.
        """
        # Update strategic mode from current observation
        kpis = observation.get("kpis", {})
        budget = observation.get("budget_remaining", 100000)
        pipeline = observation.get("role_data", {}).get("pipeline", [])
        self.base.update_strategic_mode(kpis, budget, pipeline)

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

        # Track action for repetition detection
        self.base.track_action(action.action_type)

        result = action.model_dump()
        self.base.plan(turn, f"{result['action_type']} -> {result['target']}: {result.get('reasoning', '')}")
        return result

    def _call_vllm(self, user_msg: str, rejected_actions: list[str] | None = None) -> AgentAction:
        """Call vLLM model via OpenAI-compatible endpoint.

        Includes tool definitions in the prompt so Qwen models can generate
        tool_calls alongside the primary action.
        """
        actions_list = "\n".join(f"  - {a}" for a in self._allowed_actions)

        # Build tool descriptions for the prompt
        tool_descriptions = "\n".join(
            f"  - {t.name}: {t.description}" for t in AGENT_TOOLS
        )

        json_instruction = (
            f"\n\n## CRITICAL INSTRUCTIONS\n"
            f"You are the **{self.role}** agent. You can ONLY use these actions:\n"
            f"{actions_list}\n\n"
            f"Do NOT use actions from other roles. Any action not listed above is INVALID.\n\n"
            f"## AVAILABLE TOOLS (optional)\n"
            f"You may include tool_calls to trigger integrations:\n"
            f"{tool_descriptions}\n\n"
            f"Respond with ONLY a valid JSON object, nothing else:\n"
            f"{{\"action_type\": \"<one of the actions above>\", \"target\": \"...\", "
            f"\"parameters\": {{}}, \"reasoning\": \"...\", \"message\": \"role: message\", "
            f"\"tool_calls\": [{{\"tool_name\": \"...\", \"arguments\": {{}}}}]}}"
        )

        if rejected_actions:
            unique_rejected = list(dict.fromkeys(rejected_actions))
            json_instruction += (
                f"\n\nWARNING: These actions are INVALID and were already rejected: "
                f"{', '.join(unique_rejected)}. Do NOT use them."
            )

        system_content = self.system_prompt + json_instruction

        import random as _random
        response = self.openai_client.chat.completions.create(
            model=self._vllm_endpoint["model_name"],
            max_tokens=_OUTPUT_TOKENS,
            temperature=0.7,
            seed=_random.randint(0, 2**31),
            messages=[
                {"role": "system", "content": system_content},
                {"role": "user", "content": user_msg},
            ],
        )

        text = response.choices[0].message.content or ""
        return self._parse_text_response(text)

    def _is_claude_model(self) -> bool:
        """Return True if the current model is an Anthropic Claude model."""
        return "anthropic" in self.model.lower()

    def _call_bedrock_converse(self, user_msg: str) -> AgentAction:
        """Call non-Claude Bedrock models (Mistral, Qwen, etc.) via boto3 Converse API."""
        try:
            import boto3
        except ImportError:
            raise ImportError("boto3 is required for non-Claude Bedrock models. Install with: pip install boto3")

        actions_str = ", ".join(self._allowed_actions)
        system_text = (
            self.system_prompt +
            f"\n\nRespond with ONLY a JSON object — no explanation, no markdown fences.\n"
            f"action_type MUST be exactly one of: {actions_str}\n"
            f'Format: {{"action_type": "...", "target": "...", "parameters": {{}}, "reasoning": "...", "message": null}}'
        )

        bedrock = boto3.client("bedrock-runtime", region_name=self.aws_region)
        response = bedrock.converse(
            modelId=self.model,
            system=[{"text": system_text}],
            messages=[{"role": "user", "content": [{"text": user_msg}]}],
            inferenceConfig={"maxTokens": 512, "temperature": 0.7},
        )
        text = response["output"]["message"]["content"][0]["text"]
        return self._parse_text_response(text)

    def _prune_to_budget(self, user_msg: str, token_budget: int) -> str:
        """Token-aware priority pruning.

        Sections are built in priority order (highest first). If the full
        message exceeds the budget, lowest-priority sections are dropped
        one at a time until it fits.

        Priority (high to low):
          P0: header + KPIs + budget + situation analysis + role-specific context
          P1: shared team memory (last 8 entries)
          P2: team messages (last 8)
          P3: active events
          P4: recent team actions (last 10)
          P5: role data (compact JSON)
          P6: skill library hints
          P7: current plan + reflections
          P8: call to action
        """
        current_tokens = _count_tokens(user_msg)
        if current_tokens <= token_budget:
            return user_msg

        logger.info(f"{self.role}: pruning {current_tokens} -> {token_budget} tokens")

        # Split into sections by "## " headers. Keep the header block (P0)
        # which has no "## " prefix, then each "## " section.
        lines = user_msg.split("\n")
        sections: list[tuple[int, str]] = []  # (priority, text)

        current_section_lines: list[str] = []
        current_priority = 0  # header block = P0

        # Priority map by section header keyword
        priority_map = {
            "Your KPIs": 0,
            "SITUATION ANALYSIS": 0,
            "PIPELINE STATUS": 0,
            "URGENT": 0,
            "Currently building": 0,
            "SHIPPED FEATURES": 0,
            "NO SHIPPED FEATURES": 0,
            "SHARED TEAM MEMORY": 1,
            "Team channel": 2,
            "Active Events": 3,
            "Recent team actions": 4,
            "Your role data": 5,
            "Relevant skills": 6,
            "Your current plan": 7,
            "Your recent reflections": 7,
            "ALLOWED ACTIONS": 8,
        }

        def _get_priority(line: str) -> int | None:
            for keyword, pri in priority_map.items():
                if keyword in line:
                    return pri
            return None

        for line in lines:
            if line.startswith("## ") or line.startswith(">> ") or line.startswith("!! "):
                # Save previous section
                if current_section_lines:
                    sections.append((current_priority, "\n".join(current_section_lines)))
                current_section_lines = [line]
                p = _get_priority(line)
                current_priority = p if p is not None else 5
            else:
                current_section_lines.append(line)

        # Save last section
        if current_section_lines:
            sections.append((current_priority, "\n".join(current_section_lines)))

        # Drop sections from lowest priority (highest number) until we fit
        sections_sorted_by_drop_order = sorted(
            range(len(sections)),
            key=lambda i: -sections[i][0],  # highest priority number = drop first
        )

        dropped = set()
        for idx in sections_sorted_by_drop_order:
            assembled = "\n".join(
                sections[i][1] for i in range(len(sections)) if i not in dropped
            )
            if _count_tokens(assembled) <= token_budget:
                return assembled
            dropped.add(idx)
            # Never drop P0 sections (KPIs, pipeline, header)
            if sections[idx][0] <= 0:
                dropped.discard(idx)
                break

        # If still over budget after dropping everything droppable, hard truncate
        assembled = "\n".join(
            sections[i][1] for i in range(len(sections)) if i not in dropped
        )
        tokens = _count_tokens(assembled)
        if tokens > token_budget:
            # Binary search for the right character cutoff
            lo, hi = 0, len(assembled)
            while lo < hi:
                mid = (lo + hi + 1) // 2
                if _count_tokens(assembled[:mid]) <= token_budget:
                    lo = mid
                else:
                    hi = mid - 1
            assembled = assembled[:lo]

        return assembled

    def _call_structured(self, user_msg: str) -> AgentAction:
        """Call the model and parse response into a validated AgentAction.

        Routes non-Claude models to Bedrock Converse API (boto3) since
        tool_choice is an Anthropic-only feature.

        Provides tool definitions for sheets, invoice, and GitHub alongside
        the main submit_action tool.
        """
        if not self._is_claude_model():
            return self._call_bedrock_converse(user_msg)

        tool_schema = AgentAction.model_json_schema()
        properties = tool_schema.get("properties", {})
        # Remove tool_calls from the schema — it's populated from tool use blocks
        properties.pop("tool_calls", None)

        # Build tools list: primary action + integration tools
        tools = [
            {
                "name": "submit_action",
                "description": (
                    f"Submit your chosen action. action_type MUST be one of: "
                    f"{', '.join(self._allowed_actions)}. "
                    f"You may also include tool_calls to trigger integrations "
                    f"(update_sheets, create_invoice, github_update)."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": properties,
                    "required": ["action_type"],
                },
            },
        ]
        # Add integration tools
        for tool_def in AGENT_TOOLS:
            tools.append(tool_def.to_schema())

        response = self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            system=self.system_prompt,
            messages=[{"role": "user", "content": user_msg}],
            tools=tools,
            tool_choice={"type": "tool", "name": "submit_action"},
        )

        action = None
        tool_calls = []

        for block in response.content:
            if block.type == "tool_use":
                if block.name == "submit_action":
                    action = AgentAction.model_validate(block.input)
                else:
                    # Integration tool call (sheets, invoice, github)
                    tool_calls.append(ToolCall(
                        tool_name=block.name,
                        arguments=block.input if isinstance(block.input, dict) else {},
                    ).to_dict())

        if action:
            if tool_calls:
                action.tool_calls = tool_calls
            return action

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

    def reflect(self, turn: int, observation: dict, reward: float = 0.0, day_boundary: bool = False):
        """Trigger a reflection cycle.

        Enhanced: uses event-driven triggers (high reward, failure, day boundary).
        """
        # Check if reflection should be triggered
        if not self.base.should_reflect(reward, day_boundary):
            # Still allow manual reflection if enough memories exist
            context = self.base.get_context(turn)
            if len(context["relevant_memories"]) < 3:
                return
        else:
            context = self.base.get_context(turn)

        memories = context["relevant_memories"]
        if not memories:
            return

        memory_text = "\n".join(f"- {m['description']}" for m in memories[:10])

        # Add reward context for richer reflections
        reward_context = ""
        if reward > 3.0:
            reward_context = f"\nLast action was highly successful (reward: {reward:.1f}). What made it work?"
        elif reward < -1.0:
            reward_context = f"\nLast action had poor results (reward: {reward:.1f}). What went wrong and what should change?"

        if self.use_vllm and self._vllm_endpoint:
            try:
                response = self.openai_client.chat.completions.create(
                    model=self._vllm_endpoint["model_name"],
                    max_tokens=256,
                    messages=[
                        {"role": "system", "content": f"You are a startup {self.role} agent reflecting on recent events. Current strategic mode: {self.base.strategic_mode}."},
                        {"role": "user", "content": f"Recent events:\n{memory_text}{reward_context}\n\nProvide 1-3 concise, actionable insights as a JSON object with an 'insights' array of strings."},
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
                system=f"You are a startup {self.role} agent reflecting on recent events. Current strategic mode: {self.base.strategic_mode}.",
                messages=[{"role": "user", "content": f"Recent events:\n{memory_text}{reward_context}\n\nProvide 1-3 concise, actionable insights."}],
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
        """Build the context message sent to the LLM.

        Enhanced with:
        - Strategic mode + situation analysis (P0)
        - Phase-aware guidance
        - Repetition warnings
        - Skill library hints
        """
        context = self.base.get_context(turn)
        role_data = obs.get("role_data", {})
        kpis = obs.get("kpis", {})
        budget = obs.get("budget_remaining", 0)
        phase = obs.get("phase", "execution")

        # ── P0: Header + Strategic Mode + KPIs (never dropped) ────────
        parts = [
            f"=== Day {obs.get('day', '?')} | Phase: {phase} | Turn {turn} ===",
            "",
        ]

        # Situation analysis with strategic mode and alerts
        situation = _build_situation_analysis(kpis, budget, self.base.strategic_mode, phase)
        parts.append(situation)

        parts.extend([
            "## Your KPIs",
            json.dumps(kpis, indent=2),
            "",
            f"Budget remaining: ${budget:,.0f}",
            "",
        ])

        # ── P0: Repetition warning (never dropped) ───────────────────
        rep_warning = context.get("repetition_warning", "")
        if rep_warning:
            parts.append(f"!! {rep_warning}")
            parts.append("")

        # ── P0: Role-specific critical context (never dropped) ────────
        if self.role == "dev":
            in_progress = role_data.get("features_in_progress", [])
            ready = [f for f in in_progress if f.get("turns_remaining", 99) <= 0]
            if ready:
                parts.append(f"!! URGENT: {len(ready)} feature(s) ready to ship! Use SHIP_RELEASE now!")
                parts.append("")
            elif in_progress:
                building = in_progress[0]
                parts.append(f">> Currently building: {building['name']} — use BUILD_FEATURE target=\"{building['name']}\" to continue ({building['turns_remaining']} turns left)")
                parts.append("")
            else:
                # Nothing in progress — guide toward backlog
                backlog = role_data.get("backlog", [])
                bug_reports = role_data.get("bug_reports", [])
                parts.append(">> NO features in progress. Do NOT use SHIP_RELEASE (nothing to ship).")
                if bug_reports:
                    bug = bug_reports[0]
                    parts.append(f">> SUGGESTED: FIX_BUG target=\"{bug.get('name', bug.get('id', 'unknown'))}\"")
                elif backlog:
                    item = backlog[0]
                    parts.append(f">> SUGGESTED: BUILD_FEATURE target=\"{item['name']}\"")
                else:
                    parts.append(">> SUGGESTED: REFACTOR (no backlog items)")
                parts.append("")
        elif self.role == "sales":
            pipeline = role_data.get("pipeline", [])
            if pipeline:
                # Show each customer with their exact name and the next action to take
                stage_to_action = {
                    "lead": "QUALIFY_LEAD",
                    "qualified": "RUN_DEMO",
                    "demo": "SEND_PROPOSAL",
                    "proposal": "CLOSE_DEAL",
                    "negotiation": "CLOSE_DEAL",
                }
                # Sort by closeness to closing (proposal > negotiation > demo > qualified > lead)
                stage_order = {"proposal": 0, "negotiation": 1, "demo": 2, "qualified": 3, "lead": 4}
                sorted_pipeline = sorted(pipeline[:8], key=lambda c: stage_order.get(c.get("stage", ""), 5))
                parts.append(">> PIPELINE — sorted by closest to closing (work top-down):")
                for c in sorted_pipeline:
                    stage = c['stage']
                    next_action = stage_to_action.get(stage, "FOLLOW_UP")
                    stale_warn = " !! STALE — FOLLOW_UP urgently" if c.get('days_since_contact', 0) > 3 else ""
                    size_hint = f" [{c.get('company_size', '')}]" if c.get('company_size') else ""
                    parts.append(f'   "{c["name"]}"{size_hint} stage={stage} -> use {next_action} target="{c["name"]}"{stale_warn}')
                parts.append("")
            else:
                parts.append(">> Pipeline is empty. Use COLLECT_FEEDBACK or UPDATE_SHEET while waiting for leads.")
                parts.append("")
        elif self.role == "content":
            team_status = role_data.get("team_status", {})
            shipped = team_status.get("dev", {}).get("shipped", [])
            if shipped:
                parts.append(f">> SHIPPED FEATURES (safe for case studies): {', '.join(shipped)}")
            else:
                parts.append(">> NO SHIPPED FEATURES YET — do NOT use WRITE_CASE_STUDY. Use WRITE_BLOG or WRITE_SOCIAL_POST instead.")
            parts.append("")
        elif self.role == "ceo":
            # CEO gets a high-level team status summary
            team_status = role_data.get("team_status", {})
            if team_status:
                parts.append(">> TEAM STATUS SUMMARY:")
                dev_status = team_status.get("dev", {})
                if dev_status.get("building"):
                    parts.append(f"   Dev: Building {dev_status['building']}")
                if dev_status.get("shipped"):
                    parts.append(f"   Dev: Shipped {', '.join(dev_status['shipped'])}")
                sales_status = team_status.get("sales", {})
                if sales_status.get("pipeline_count"):
                    parts.append(f"   Sales: {sales_status['pipeline_count']} in pipeline")
                if sales_status.get("deals_closed"):
                    parts.append(f"   Sales: {sales_status['deals_closed']} deals closed")
                parts.append("")

        # ── P1: Shared team memory (last 8) ───────────────────────────
        shared_mem = role_data.pop("shared_memory", [])
        if shared_mem:
            parts.append("## SHARED TEAM MEMORY (all agents see this)")
            for entry in shared_mem[-8:]:
                parts.append(f"  [{entry.get('author', '?')}] ({entry.get('type', '?')}) {entry.get('content', '')}")
            parts.append("")

        # ── P2: Team messages (last 8) ────────────────────────────────
        messages = obs.get("messages", [])
        if messages:
            # Highlight messages addressed to this agent
            parts.append("## Team channel (recent messages)")
            for m in messages[-8:]:
                to = m.get('to', 'all')
                prefix = ">>> " if to == self.role else "  "
                parts.append(f"{prefix}{m.get('from', '?')} -> {to}: {m.get('content', '')}")
            parts.append("")

        # ── P3: Active events ─────────────────────────────────────────
        events = obs.get("events", [])
        if events:
            parts.append("## Active Events")
            for e in events:
                parts.append(f"  - {e.get('name', '?')}: {e.get('description', '')}")
            parts.append("")

        # ── P4: Recent team actions (last 10) ─────────────────────────
        recent = obs.get("recent_actions", [])
        if recent:
            parts.append("## Recent team actions")
            for a in recent[-10:]:
                parts.append(f"  [{a.get('agent_id')}] {a.get('action_type')} -> {a.get('detail', '')}")
            parts.append("")

        # ── P5: Role data (compact) ───────────────────────────────────
        if role_data:
            compact = {}
            for k, v in role_data.items():
                if isinstance(v, list) and len(v) > 3:
                    compact[k] = v[:3]
                elif isinstance(v, str) and len(v) > 150:
                    compact[k] = v[:150]
                else:
                    compact[k] = v
            role_str = json.dumps(compact, indent=1, default=str)
            if len(role_str) > 800:
                role_str = role_str[:800] + "..."
            parts.append("## Your role data")
            parts.append(role_str)
            parts.append("")

        # ── P6: Skill library hints ───────────────────────────────────
        skill_lib = context.get("skill_library", {})
        relevant_skills = skill_lib.get("relevant_skills", [])
        if relevant_skills:
            parts.append("## Relevant skills from past successes")
            for skill in relevant_skills[:3]:
                parts.append(f"  - {skill['action_type']} -> {skill['target']} (reward: {skill['reward']:.1f}): {skill['reasoning']}")
            parts.append("")

        # ── P7: Current plan + reflections ─────────────────────────────
        if context.get("current_plan"):
            parts.append(f"## Your current plan: {context['current_plan']}")

        reflections = context.get("recent_reflections", [])
        if reflections:
            parts.append("## Your recent reflections")
            for r in reflections[:2]:
                parts.append(f"  - {r}")
            parts.append("")

        # ── P8: Call to action ────────────────────────────────────────
        parts.append(f"Given mode={self.base.strategic_mode} and phase={phase}, pick the HIGHEST IMPACT action. Respond with JSON only.")

        full_msg = "\n".join(parts)
        # Prune to context budget if needed (Qwen3.5-0.8B supports full 262K)
        return self._prune_to_budget(full_msg, _MAX_CONTEXT_TOKENS - _OUTPUT_TOKENS)

    def _summarize_observation(self, obs: dict) -> str:
        """Create a brief text summary of an observation for memory."""
        kpis = obs.get("kpis", {})
        day = obs.get("day", "?")
        phase = obs.get("phase", "?")
        result = obs.get("last_action_result", {})
        detail = result.get("detail", "no action yet")
        return f"Day {day} ({phase}): {detail}. KPIs: revenue=${kpis.get('revenue', 0)}, traffic={kpis.get('website_traffic', 0)}"
