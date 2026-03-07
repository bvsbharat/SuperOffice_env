"""Dynamic market event generator."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

from .state import Customer, MarketState
from .config import Config


@dataclass
class MarketEvent:
    """A market event that affects simulation state."""

    id: str
    name: str
    description: str
    day: int
    effects: dict


EVENT_TEMPLATES = [
    {
        "name": "Competitor Launch",
        "description": "A competitor launched a new product. Market share pressure increases.",
        "apply": "_apply_competitor_launch",
    },
    {
        "name": "Viral Moment",
        "description": "Your content went viral! Sudden traffic spike.",
        "apply": "_apply_viral_moment",
    },
    {
        "name": "PR Crisis",
        "description": "Negative press coverage. Brand awareness drops.",
        "apply": "_apply_pr_crisis",
    },
    {
        "name": "Algorithm Change",
        "description": "Search engine algorithm changed. Organic traffic shifts.",
        "apply": "_apply_algo_change",
    },
    {
        "name": "Budget Cut",
        "description": "Board cuts marketing budget by 30%.",
        "apply": "_apply_budget_cut",
    },
    {
        "name": "Big Customer Inquiry",
        "description": "A Fortune 500 company reached out. Huge deal potential.",
        "apply": "_apply_big_customer",
    },
    {
        "name": "Feature Request Wave",
        "description": "Multiple customers requesting the same feature.",
        "apply": "_apply_feature_wave",
    },
    {
        "name": "Customer Success Story",
        "description": "A happy customer wants to do a case study.",
        "apply": "_apply_success_story",
    },
]


class EventEngine:
    """Generates and applies random market events."""

    def __init__(self):
        self.cfg = Config()

    def tick(self, state: MarketState) -> list[MarketEvent]:
        """Called each turn. May generate events at the start of each day."""
        events = []
        # Only generate events at the start of a new day
        if state.turn % 10 != 0 or state.turn == 0:
            return events

        if state._rng.random() < self.cfg.event_probability:
            template = state._rng.choice(EVENT_TEMPLATES)
            event = MarketEvent(
                id=str(uuid4())[:8],
                name=template["name"],
                description=template["description"],
                day=state.day,
                effects={},
            )
            # Apply the event
            handler = getattr(self, template["apply"], None)
            if handler:
                handler(state, event)
            state.active_events.append({
                "id": event.id,
                "name": event.name,
                "description": event.description,
                "day": event.day,
            })
            events.append(event)

        return events

    def _apply_competitor_launch(self, state: MarketState, event: MarketEvent):
        state.website_traffic = max(100, state.website_traffic - state._rng.randint(50, 200))
        state.brand_awareness = max(0, state.brand_awareness - 3.0)
        # Some leads may reconsider
        for c in state.active_leads():
            if state._rng.random() < 0.2:
                c.objections.append("Considering competitor product")
        event.effects = {"traffic_lost": True, "leads_at_risk": True}

    def _apply_viral_moment(self, state: MarketState, event: MarketEvent):
        boost = state._rng.randint(500, 2000)
        state.website_traffic += boost
        state.brand_awareness = min(100, state.brand_awareness + 10)
        # Spawn extra leads
        for _ in range(state._rng.randint(2, 5)):
            customer = state.maybe_spawn_customer()
            if customer:
                customer.source = "viral"
                customer.previous_stage = "visitor"
                customer.stage = "lead"
                state._stage_transitions.append(customer)
        event.effects = {"traffic_boost": boost}

    def _apply_pr_crisis(self, state: MarketState, event: MarketEvent):
        state.brand_awareness = max(0, state.brand_awareness - 15)
        # Active leads get an objection
        for c in state.active_leads():
            c.objections.append("Concerned about recent press")
        event.effects = {"brand_hit": True}

    def _apply_algo_change(self, state: MarketState, event: MarketEvent):
        change = state._rng.randint(-300, 100)
        state.website_traffic = max(100, state.website_traffic + change)
        event.effects = {"traffic_change": change}

    def _apply_budget_cut(self, state: MarketState, event: MarketEvent):
        cut = state.budget_remaining * 0.3
        state.budget_remaining -= cut
        event.effects = {"budget_cut": cut}

    def _apply_big_customer(self, state: MarketState, event: MarketEvent):
        big_customer = Customer(
            id=str(uuid4())[:8],
            name="Fortune 500 Corp",
            company_size="enterprise",
            industry="enterprise",
            budget=200000.0,
            pain_point="Full platform integration",
            source="inbound",
            stage="lead",
            created_day=state.day,
            last_contacted_day=state.day,
        )
        state.customers.append(big_customer)
        state._stage_transitions.append(big_customer)
        event.effects = {"new_enterprise_lead": big_customer.name}

    def _apply_feature_wave(self, state: MarketState, event: MarketEvent):
        feature_name = state._rng.choice(["SSO Integration", "Mobile App", "Webhooks", "Custom Reports", "Bulk Import"])
        state.backlog.append({
            "id": str(uuid4())[:8],
            "name": feature_name,
            "description": f"Multiple customers requesting {feature_name}",
            "priority": "high",
            "requested_by": "customers",
        })
        state.feedback.append({
            "customer": "multiple",
            "content": f"3+ customers need {feature_name}",
            "day": state.day,
        })
        event.effects = {"feature_requested": feature_name}

    def _apply_success_story(self, state: MarketState, event: MarketEvent):
        won = [c for c in state.customers if c.stage == "closed_won"]
        if won:
            customer = state._rng.choice(won)
            state.feedback.append({
                "customer": customer.name,
                "content": f"{customer.name} is happy and wants to do a case study",
                "day": state.day,
            })
            event.effects = {"case_study_opportunity": customer.name}
        else:
            event.effects = {"no_customers_for_story": True}
