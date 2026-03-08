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
