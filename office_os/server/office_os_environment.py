# Copyright (c) Meta Platforms, Inc. and affiliates.
# All rights reserved.
#
# This source code is licensed under the BSD-style license found in the
# LICENSE file in the root directory of this source tree.

"""
MarketVille Environment Implementation.

A Smallville-style multi-agent startup simulation where 4 agents
(Dev, Marketing, Sales, Content Creator) collaborate to grow a company
over 90 simulated days.
"""

from uuid import uuid4

from openenv.core.env_server.interfaces import Environment
from openenv.core.env_server.types import State

from models import OfficeOsAction, OfficeOsObservation
from market.state import MarketState
from market.simulator import MarketSimulator
from market.events import EventEngine
from market.metrics import RewardCalculator
from market.config import EPISODE_DAYS, ROLE_ACTIONS
from integrations.sheets import GoogleSheetsSync


class OfficeOsEnvironment(Environment):
    """
    MarketVille: Multi-agent startup simulation environment.

    4 agents (dev, marketing, sales, content) take turns executing actions
    in a simulated startup. Customers flow through a pipeline from visitor
    to closed_won, with each agent contributing at different stages.

    Example:
        >>> env = OfficeOsEnvironment()
        >>> obs = env.reset()
        >>> obs = env.step(OfficeOsAction(
        ...     agent_id="dev",
        ...     action_type="BUILD_FEATURE",
        ...     target="SSO Integration",
        ... ))
        >>> print(obs.kpis)
    """

    SUPPORTS_CONCURRENT_SESSIONS: bool = True

    def __init__(self):
        self._state = State(episode_id=str(uuid4()), step_count=0)
        self._market = MarketState.initial()
        self._simulator = MarketSimulator(self._market)
        self._events = EventEngine()
        self._rewards = RewardCalculator()
        self._sheets = GoogleSheetsSync()
        self._sheets.setup()

    def reset(self) -> OfficeOsObservation:
        """Reset the environment to day 1 of a new startup quarter."""
        self._state = State(episode_id=str(uuid4()), step_count=0)
        self._market = MarketState.initial()
        self._simulator = MarketSimulator(self._market)
        self._rewards = RewardCalculator()
        self._rewards.snapshot(self._market)

        # Sync initial state to Google Sheets
        self._sheets.update_dashboard(self._market)
        self._sheets.update_customers(self._market)

        return OfficeOsObservation(
            agent_id="all",
            day=1,
            phase="morning_standup",
            kpis=self._market.get_all_kpis(),
            budget_remaining=self._market.budget_remaining,
            recent_actions=[],
            messages=[{"from": "system", "content": "MarketVille simulation started. Day 1 begins."}],
            events=[],
            role_data={
                "available_roles": ["dev", "marketing", "sales", "content"],
                "backlog": self._market.backlog,
            },
            last_action_result={},
            done=False,
            reward=0.0,
        )

    def step(self, action: OfficeOsAction) -> OfficeOsObservation:  # type: ignore[override]
        """
        Execute one agent's action and return observation.

        Args:
            action: OfficeOsAction with agent_id, action_type, target, etc.

        Returns:
            OfficeOsObservation scoped to the acting agent's role.
        """
        self._state.step_count += 1

        # Take KPI snapshot before action
        self._rewards.snapshot(self._market)

        # Execute the action
        action_result = self._simulator.execute_action(
            agent_id=action.agent_id,
            action_type=action.action_type,
            target=action.target,
            parameters=action.parameters,
            message=action.message,
        )

        # Process market events
        new_events = self._events.tick(self._market)

        # Advance simulation clock
        self._simulator.advance()

        # Calculate reward for this agent
        reward = self._rewards.calculate(
            state=self._market,
            agent_id=action.agent_id,
            action_result=action_result,
        )

        # Google Sheets sync: dashboard + customers on every step
        self._sheets.update_dashboard(self._market)
        self._sheets.update_customers(self._market)

        # Create invoice sheets for any newly closed deals
        for customer in self._market.customers:
            if customer.stage == "closed_won" and customer.previous_stage != "closed_won":
                self._sheets.create_invoice(customer, self._market)

        # Build asymmetric observation
        done = self._market.day > EPISODE_DAYS

        return self._build_observation(
            agent_id=action.agent_id,
            new_events=new_events,
            reward=reward,
            done=done,
            action_result=action_result,
        )

    @property
    def state(self) -> State:
        return self._state

    def _build_observation(
        self,
        agent_id: str,
        new_events: list,
        reward: float,
        done: bool,
        action_result: dict,
    ) -> OfficeOsObservation:
        """Build role-scoped observation for the acting agent."""
        role = agent_id

        # Role-specific data
        role_data = self._get_role_data(role)

        return OfficeOsObservation(
            agent_id=agent_id,
            day=self._market.day,
            phase=self._market.phase,
            kpis=self._market.get_kpis_for_role(role),
            budget_remaining=self._market.budget_remaining,
            recent_actions=self._market.get_visible_actions(agent_id),
            messages=self._market.get_messages_for(agent_id),
            events=[
                {"name": e.name, "description": e.description}
                for e in new_events
            ],
            role_data=role_data,
            last_action_result=action_result,
            done=done,
            reward=reward,
            metadata={
                "step": self._state.step_count,
                "episode_id": self._state.episode_id,
                "turn": self._market.turn,
            },
        )

    def _get_role_data(self, role: str) -> dict:
        """Get role-specific observation data."""
        data: dict = {"available_actions": ROLE_ACTIONS.get(role, [])}

        if role == "dev":
            data["backlog"] = self._market.backlog[:5]
            data["bug_reports"] = self._market.bug_reports[:5]
            data["features_in_progress"] = [
                {"name": f.name, "turns_remaining": f.turns_remaining, "shipped": f.shipped}
                for f in self._market.features
                if not f.shipped
            ]
            data["shipped_features"] = [f.name for f in self._market.shipped_features()]
            data["feedback"] = self._market.feedback[-5:]

        elif role == "marketing":
            data["all_customers"] = [
                {"name": c.name, "stage": c.stage, "budget": c.budget, "source": c.source}
                for c in self._market.customers
            ]
            data["campaigns"] = [
                {"name": c.name, "type": c.campaign_type, "active": c.active, "days_left": c.days_remaining}
                for c in self._market.campaigns
            ]
            data["content_available"] = [
                {"title": p.title, "type": p.content_type, "quality": p.quality}
                for p in self._market.content_pieces
                if p.published
            ]
            data["shipped_features"] = [f.name for f in self._market.shipped_features()]

        elif role == "sales":
            data["pipeline"] = [
                {
                    "id": c.id,
                    "name": c.name,
                    "stage": c.stage,
                    "budget": c.budget,
                    "pain_point": c.pain_point,
                    "days_since_contact": self._market.day - c.last_contacted_day,
                    "content_touchpoints": c.content_touchpoints,
                    "objections": c.objections,
                }
                for c in self._market.customers
                if c.stage not in ("closed_won", "closed_lost", "churned")
            ]
            data["shipped_features"] = [
                {"name": f.name, "description": f.description}
                for f in self._market.shipped_features()
            ]
            data["content_available"] = [
                {"title": p.title, "type": p.content_type}
                for p in self._market.content_pieces
                if p.published and p.content_type in ("case_study", "docs")
            ]

        elif role == "content":
            data["shipped_features"] = [
                {"name": f.name, "description": f.description}
                for f in self._market.shipped_features()
            ]
            data["content_pieces"] = [
                {"id": p.id, "title": p.title, "type": p.content_type, "quality": p.quality}
                for p in self._market.content_pieces
            ]
            data["customer_stories"] = [
                fb for fb in self._market.feedback
                if "case study" in fb.get("content", "").lower()
                or "happy" in fb.get("content", "").lower()
            ]
            data["content_calendar_suggestion"] = self._suggest_content()

        return data

    def _suggest_content(self) -> list[str]:
        """Suggest content topics based on current state."""
        suggestions = []
        # Suggest writing about recently shipped features
        for f in self._market.shipped_features():
            if not any(p.topic == f.name for p in self._market.content_pieces):
                suggestions.append(f"Write about new feature: {f.name}")
        # Suggest case studies from happy customers
        for fb in self._market.feedback:
            if "case study" in fb.get("content", "").lower():
                suggestions.append(f"Case study: {fb.get('customer', 'customer')}")
        if not suggestions:
            suggestions.append("Write a thought leadership blog post")
        return suggestions[:3]
