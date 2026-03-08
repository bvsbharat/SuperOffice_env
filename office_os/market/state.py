"""Market state management for Office OS."""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from uuid import uuid4

from .config import (
    Config,
    DAY_PHASES,
    PHASE_TURNS,
    PIPELINE_STAGES,
    SAMPLE_CUSTOMERS,
    TURNS_PER_DAY,
)


@dataclass
class Customer:
    """A customer moving through the sales pipeline."""

    id: str
    name: str
    company_size: str
    industry: str
    budget: float
    pain_point: str
    source: str = ""
    stage: str = "visitor"
    created_day: int = 1
    content_touchpoints: list[str] = field(default_factory=list)
    objections: list[str] = field(default_factory=list)
    satisfaction: float = 0.5
    last_contacted_day: int = 0
    previous_stage: str = ""
    contract_tier: str = ""  # "monthly", "6_month", "annual" -- set on close

    def advance_stage(self) -> bool:
        """Move customer to the next pipeline stage. Returns True if moved."""
        idx = PIPELINE_STAGES.index(self.stage)
        if idx < PIPELINE_STAGES.index("closed_won"):
            self.previous_stage = self.stage
            self.stage = PIPELINE_STAGES[idx + 1]
            return True
        return False


@dataclass
class Feature:
    """A product feature being developed or shipped."""

    id: str
    name: str
    description: str
    turns_remaining: int = 3
    shipped: bool = False
    stability: float = 1.0  # 0-1, how stable this feature is


@dataclass
class ContentPiece:
    """A piece of content produced by the Content Creator."""

    id: str
    content_type: str  # blog, social_post, case_study, email_sequence, docs
    title: str
    topic: str
    quality: float = 0.5  # 0-1
    published: bool = False
    engagement: float = 0.0
    leads_generated: int = 0
    turns_remaining: int = 0


@dataclass
class Campaign:
    """A marketing campaign."""

    id: str
    campaign_type: str  # ad, seo, ab_test
    name: str
    cost: float
    days_remaining: int = 7
    leads_generated: int = 0
    active: bool = True


@dataclass
class Message:
    """A message between agents."""

    from_agent: str
    to_agent: str
    content: str
    day: int
    turn: int


@dataclass
class SharedMemoryEntry:
    """An entry in the shared team knowledge board."""

    author: str          # agent role who posted
    entry_type: str      # "update", "request", "insight", "alert"
    content: str         # the knowledge/message
    day: int
    turn: int


@dataclass
class SharedMemory:
    """
    Shared team knowledge board — all agents read and write.

    Inspired by colony-collapse's SharedKnowledge pattern.
    Agents post updates, requests, and insights here.
    All entries are visible to all agents.
    """

    entries: list[SharedMemoryEntry] = field(default_factory=list)

    def post(self, author: str, entry_type: str, content: str, day: int, turn: int):
        """Add an entry to shared memory."""
        self.entries.append(SharedMemoryEntry(
            author=author, entry_type=entry_type,
            content=content, day=day, turn=turn,
        ))

    def recent(self, last_n: int = 15) -> list[dict]:
        """Get recent entries as dicts for observation."""
        return [
            {"author": e.author, "type": e.entry_type, "content": e.content, "day": e.day}
            for e in self.entries[-last_n:]
        ]

    def by_type(self, entry_type: str) -> list[dict]:
        """Get entries filtered by type."""
        return [
            {"author": e.author, "content": e.content, "day": e.day}
            for e in self.entries if e.entry_type == entry_type
        ]

    def requests_for(self, role: str) -> list[dict]:
        """Get open requests targeted at a specific role."""
        return [
            {"from": e.author, "content": e.content, "day": e.day}
            for e in self.entries
            if e.entry_type == "request" and role in e.content.lower()
        ]


@dataclass
class MarketState:
    """Full simulation state."""

    # Time
    day: int = 1
    turn: int = 0
    phase: str = "morning_standup"
    phase_turn: int = 0

    # Company KPIs
    website_traffic: int = 1000
    conversion_rate: float = 0.02
    revenue: float = 0.0
    total_revenue: float = 0.0
    brand_awareness: float = 10.0
    product_stability: float = 1.0

    # Resources
    budget_remaining: float = 15000.0

    # Entities
    customers: list[Customer] = field(default_factory=list)
    features: list[Feature] = field(default_factory=list)
    content_pieces: list[ContentPiece] = field(default_factory=list)
    campaigns: list[Campaign] = field(default_factory=list)

    # Feature backlog / bug reports
    backlog: list[dict] = field(default_factory=list)
    bug_reports: list[dict] = field(default_factory=list)
    feedback: list[dict] = field(default_factory=list)

    # Communication
    messages: list[Message] = field(default_factory=list)
    recent_actions: list[dict] = field(default_factory=list)
    shared_memory: SharedMemory = field(default_factory=SharedMemory)

    # CEO / HR tracking
    okrs: list[dict] = field(default_factory=list)  # Current OKRs set by CEO
    team_velocity: float = 1.0  # 0-2, multiplier on dev/content speed
    blockers: list[dict] = field(default_factory=list)  # Active blockers
    contractors: int = 0  # Hired contractors (boost velocity)
    nps_score: float = 50.0  # Net Promoter Score from customers (0-100)
    customer_satisfaction: float = 0.5  # 0-1

    # Events
    active_events: list[dict] = field(default_factory=list)

    # Tracking
    _stage_transitions: list[Customer] = field(default_factory=list)
    _customer_pool_index: int = 0
    _next_customer_day: int = 1
    _rng: random.Random = field(default_factory=lambda: random.Random())
    _last_referral_day: int = 0
    _renewed_customer_ids: dict = field(default_factory=dict)

    @classmethod
    def initial(cls, seed: int | None = None, scenario: str = "baseline") -> MarketState:
        """Create initial market state, optionally modified by a scenario."""
        cfg = Config()
        rng = random.Random(seed)

        from .scenarios import get_scenario
        sc = get_scenario(scenario)

        state = cls(
            website_traffic=int(cfg.initial_traffic * sc.traffic_modifier),
            conversion_rate=cfg.initial_conversion_rate,
            revenue=cfg.initial_revenue,
            brand_awareness=cfg.initial_brand_awareness,
            budget_remaining=cfg.initial_budget * sc.budget_modifier,
            nps_score=sc.initial_nps,
            customer_satisfaction=sc.initial_satisfaction,
            product_stability=sc.initial_stability,
            _rng=rng,
        )
        # Seed the backlog with a couple of feature requests
        state.backlog = [
            {"id": str(uuid4())[:8], "name": "SSO Integration", "description": "Enterprise single sign-on", "priority": "high", "requested_by": "market"},
            {"id": str(uuid4())[:8], "name": "API v2", "description": "RESTful API improvements", "priority": "medium", "requested_by": "market"},
            {"id": str(uuid4())[:8], "name": "Dashboard Redesign", "description": "New analytics dashboard", "priority": "low", "requested_by": "market"},
        ]
        # Add scenario-specific backlog items
        for item in sc.extra_backlog:
            state.backlog.append(item)
        # Add scenario-specific bug reports
        for bug in sc.extra_bug_reports:
            state.bug_reports.append(bug)

        # Seed initial customers as leads
        num_leads = min(sc.initial_leads, len(SAMPLE_CUSTOMERS))
        for template in SAMPLE_CUSTOMERS[:num_leads]:
            customer = Customer(
                id=str(uuid4())[:8],
                name=template["name"],
                company_size=template["company_size"],
                industry=template["industry"],
                budget=template["budget"],
                pain_point=template["pain_point"],
                source="organic",
                stage="lead",
                created_day=1,
                last_contacted_day=1,
            )
            state.customers.append(customer)
        state._customer_pool_index = num_leads

        # Add scenario-specific extra customers
        for ec in sc.extra_customers:
            customer = Customer(
                id=str(uuid4())[:8],
                name=ec["name"],
                company_size=ec["company_size"],
                industry=ec["industry"],
                budget=ec["budget"],
                pain_point=ec["pain_point"],
                source="scenario",
                stage="lead",
                created_day=1,
                last_contacted_day=1,
            )
            state.customers.append(customer)

        return state

    def get_all_kpis(self) -> dict:
        return {
            "day": self.day,
            "website_traffic": self.website_traffic,
            "conversion_rate": self.conversion_rate,
            "revenue": self.revenue,
            "total_revenue": self.total_revenue,
            "brand_awareness": self.brand_awareness,
            "product_stability": self.product_stability,
            "budget_remaining": self.budget_remaining,
            "active_customers": len([c for c in self.customers if c.stage not in ("closed_lost", "churned")]),
            "pipeline_value": sum(c.budget for c in self.customers if c.stage in ("qualified", "demo", "proposal", "negotiation")),
            "features_shipped": len([f for f in self.features if f.shipped]),
            "content_published": len([p for p in self.content_pieces if p.published]),
            "active_campaigns": len([c for c in self.campaigns if c.active]),
            "team_velocity": self.team_velocity,
            "nps_score": self.nps_score,
            "customer_satisfaction": self.customer_satisfaction,
            "okrs_set": len(self.okrs),
            "blockers": len(self.blockers),
        }

    def get_kpis_for_role(self, role: str) -> dict:
        """Return KPIs scoped to a specific agent role."""
        all_kpis = self.get_all_kpis()
        if role == "marketing":
            return all_kpis  # Marketing sees everything
        elif role == "dev":
            return {
                "product_stability": all_kpis["product_stability"],
                "features_shipped": all_kpis["features_shipped"],
                "backlog_size": len(self.backlog),
                "bug_count": len(self.bug_reports),
                "feedback_count": len(self.feedback),
            }
        elif role == "sales":
            return {
                "revenue": all_kpis["revenue"],
                "pipeline_value": all_kpis["pipeline_value"],
                "active_customers": all_kpis["active_customers"],
                "features_shipped": all_kpis["features_shipped"],
            }
        elif role == "content":
            return {
                "website_traffic": all_kpis["website_traffic"],
                "content_published": all_kpis["content_published"],
                "brand_awareness": all_kpis["brand_awareness"],
                "features_shipped": all_kpis["features_shipped"],
            }
        elif role == "ceo":
            return all_kpis  # CEO sees everything
        elif role == "hr":
            return {
                "team_velocity": all_kpis["team_velocity"],
                "features_shipped": all_kpis["features_shipped"],
                "blockers": all_kpis["blockers"],
                "okrs_set": all_kpis["okrs_set"],
                "budget_remaining": all_kpis["budget_remaining"],
            }
        elif role == "customer":
            return {
                "product_stability": all_kpis["product_stability"],
                "features_shipped": all_kpis["features_shipped"],
                "nps_score": all_kpis["nps_score"],
                "content_published": all_kpis["content_published"],
            }
        return all_kpis

    def get_visible_actions(self, agent_id: str) -> list[dict]:
        """Get recent actions visible to an agent."""
        # All agents can see the last 10 actions
        return self.recent_actions[-10:]

    def get_messages_for(self, agent_id: str) -> list[dict]:
        """Get all recent messages (shared team channel). All agents see everything."""
        return [
            {"from": m.from_agent, "to": m.to_agent, "content": m.content, "day": m.day}
            for m in self.messages
            if m.day >= self.day - 1
        ]

    def shipped_features(self) -> list[Feature]:
        return [f for f in self.features if f.shipped]

    def active_leads(self) -> list[Customer]:
        return [
            c for c in self.customers
            if c.stage not in ("visitor", "closed_won", "closed_lost", "churned")
        ]

    def customers_that_moved_stage(self) -> list[Customer]:
        """Customers that transitioned stages this turn."""
        transitions = list(self._stage_transitions)
        self._stage_transitions.clear()
        return transitions

    def maybe_spawn_customer(self) -> Customer | None:
        """Spawn a new customer if it's time."""
        cfg = Config()
        if self.day < self._next_customer_day:
            return None

        # Pick from sample pool, cycling
        template = SAMPLE_CUSTOMERS[self._customer_pool_index % len(SAMPLE_CUSTOMERS)]
        self._customer_pool_index += 1

        # Source depends on what content/campaigns exist
        sources = ["organic"]
        if self.content_pieces:
            sources.append("blog")
        if self.campaigns:
            sources.append("ad")
        source = self._rng.choice(sources)

        customer = Customer(
            id=str(uuid4())[:8],
            name=template["name"],
            company_size=template["company_size"],
            industry=template["industry"],
            budget=template["budget"],
            pain_point=template["pain_point"],
            source=source,
            stage="visitor",
            created_day=self.day,
            last_contacted_day=self.day,
        )
        self.customers.append(customer)
        self._stage_transitions.append(customer)

        # Schedule next customer
        self._next_customer_day = self.day + self._rng.randint(
            cfg.min_days_between_customers, cfg.max_days_between_customers
        )
        return customer

    def decay_stale_leads(self) -> list[Customer]:
        """Mark leads as lost if not contacted within decay period."""
        cfg = Config()
        lost = []
        for c in self.customers:
            if c.stage in ("lead", "qualified") and (self.day - c.last_contacted_day) > cfg.lead_decay_days:
                c.previous_stage = c.stage
                c.stage = "closed_lost"
                self._stage_transitions.append(c)
                lost.append(c)
        return lost

    def advance_time(self):
        """Advance the simulation clock by one turn."""
        self.turn += 1
        self.phase_turn += 1

        # Determine current phase
        accumulated = 0
        for phase_name, turns in PHASE_TURNS.items():
            accumulated += turns
            if (self.turn % TURNS_PER_DAY) < accumulated:
                self.phase = phase_name
                break

        # New day?
        if self.turn % TURNS_PER_DAY == 0 and self.turn > 0:
            self.day += 1
            self.phase_turn = 0

            # Monthly budget refresh (every 30 days)
            if self.day % 30 == 0:
                cfg = Config()
                self.budget_remaining += cfg.monthly_budget_refresh + (self.revenue * 0.1)
                self.revenue = 0.0  # Reset monthly revenue

            # Decay stale leads
            self.decay_stale_leads()

            # Maybe spawn customer
            self.maybe_spawn_customer()

            # Tick campaigns
            for campaign in self.campaigns:
                if campaign.active:
                    campaign.days_remaining -= 1
                    if campaign.days_remaining <= 0:
                        campaign.active = False
