# Copyright (c) Meta Platforms, Inc. and affiliates.
# All rights reserved.
#
# This source code is licensed under the BSD-style license found in the
# LICENSE file in the root directory of this source tree.

"""
Data models for the Office OS Environment.

A Smallville-style multi-agent startup simulation where Dev, Marketing,
Sales, and Content Creator agents collaborate to grow a company.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Optional

from pydantic import Field

from openenv.core.env_server.types import Action, Observation


class OfficeOsAction(Action):
    """A single agent's action for one turn in the Office OS simulation."""

    agent_id: str = Field(
        ..., description="Which agent is acting: dev, marketing, sales, content"
    )
    action_type: str = Field(
        ..., description="Action type e.g. BUILD_FEATURE, LAUNCH_CAMPAIGN, CLOSE_DEAL, WRITE_BLOG"
    )
    target: str = Field(
        default="", description="What the action applies to (feature name, customer name, etc.)"
    )
    parameters: dict = Field(
        default_factory=dict, description="Action-specific parameters"
    )
    reasoning: str = Field(
        default="", description="Agent's reasoning for this action (for visualization)"
    )
    message: Optional[str] = Field(
        default=None,
        description="Optional message to another agent, format: 'agent_id: message text'",
    )


# ---------------------------------------------------------------------------
# Dataclasses replacing raw dicts throughout the codebase
# ---------------------------------------------------------------------------

@dataclass
class ActionResult:
    """Structured result from executing a simulation action.

    Supports both attribute access (result.success) and dict-style access
    (result["success"], result.get("detail")) for backward compatibility.
    """

    agent_id: str = ""
    action_type: str = ""
    success: bool = True
    detail: str = ""
    parameters: dict = field(default_factory=dict)
    contract_tier: str | None = None
    trigger_sheets_sync: bool = False

    # Allow dict-style access for backward compatibility
    def get(self, key: str, default=None):
        if key == "_trigger_sheets_sync":
            return self.trigger_sheets_sync
        return getattr(self, key, default)

    def __getitem__(self, key: str):
        if key == "_trigger_sheets_sync":
            return self.trigger_sheets_sync
        return getattr(self, key)

    def __setitem__(self, key: str, value):
        if key == "_trigger_sheets_sync":
            self.trigger_sheets_sync = value
        else:
            setattr(self, key, value)

    def __contains__(self, key: str) -> bool:
        if key == "_trigger_sheets_sync":
            return True
        return hasattr(self, key)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["_trigger_sheets_sync"] = d.pop("trigger_sheets_sync")
        return d


@dataclass
class ToolCall:
    """A structured tool invocation from an agent."""

    tool_name: str
    arguments: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ToolDefinition:
    """Schema for a tool available to an agent."""

    name: str
    description: str
    parameters: dict = field(default_factory=dict)

    def to_schema(self) -> dict:
        """Return Anthropic / OpenAI-compatible tool schema."""
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": self.parameters,
            },
        }


@dataclass
class RewardBreakdown:
    """Decomposed reward signals for multi-signal training.

    Instead of a single composite reward, each turn produces explicit sub-signals
    that the training pipeline can use separately or combined.
    """

    format_reward: float = 0.0
    role_compliance: float = 0.0
    execution_reward: float = 0.0
    impact_reward: float = 0.0
    collaboration_reward: float = 0.0
    efficiency_penalty: float = 0.0

    @property
    def total(self) -> float:
        return (
            self.format_reward
            + self.role_compliance
            + self.execution_reward
            + self.impact_reward
            + self.collaboration_reward
            + self.efficiency_penalty
        )

    def to_dict(self) -> dict:
        return {
            "format_reward": round(self.format_reward, 3),
            "role_compliance": round(self.role_compliance, 3),
            "execution_reward": round(self.execution_reward, 3),
            "impact_reward": round(self.impact_reward, 3),
            "collaboration_reward": round(self.collaboration_reward, 3),
            "efficiency_penalty": round(self.efficiency_penalty, 3),
            "total": round(self.total, 3),
        }


class OfficeOsObservation(Observation):
    """What an agent sees after a step. Asymmetric per role."""

    agent_id: str = Field(default="", description="Which agent this observation is for")
    day: int = Field(default=1, description="Current simulation day")
    phase: str = Field(default="morning_standup", description="Current day phase")

    # KPIs (scoped per agent role)
    kpis: dict = Field(default_factory=dict, description="Visible KPI metrics")
    budget_remaining: float = Field(default=0.0, description="Remaining budget")

    # Context
    recent_actions: list = Field(default_factory=list, description="Recent actions by all agents")
    messages: list = Field(default_factory=list, description="Messages from other agents")
    events: list = Field(default_factory=list, description="Active market events")

    # Role-specific data
    role_data: dict = Field(default_factory=dict, description="Role-specific observation data")

    # Action result from last step
    last_action_result: dict = Field(default_factory=dict, description="Result of the last action taken")
