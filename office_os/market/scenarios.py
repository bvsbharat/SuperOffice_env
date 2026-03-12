"""Scenario definitions for Office OS simulation.

Each scenario modifies the initial market state and injects scheduled events
to test multi-agent coordination under different market conditions.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ScheduledEvent:
    """An event that fires on a specific day."""
    day: int
    name: str
    description: str
    handler: str  # method name on EventEngine


@dataclass
class Scenario:
    """A simulation scenario with initial modifiers and scheduled events."""
    name: str
    description: str
    # Modifiers applied to initial MarketState
    budget_modifier: float = 1.0        # Multiplier on starting budget
    traffic_modifier: float = 1.0       # Multiplier on starting traffic
    initial_leads: int = 2              # Number of leads seeded at start
    extra_customers: list[dict] = field(default_factory=list)
    extra_backlog: list[dict] = field(default_factory=list)
    extra_bug_reports: list[dict] = field(default_factory=list)
    initial_nps: float = 50.0
    initial_satisfaction: float = 0.5
    initial_stability: float = 1.0
    event_probability_modifier: float = 1.0  # Multiplier on random event chance
    # Scheduled events that fire on specific days
    scheduled_events: list[ScheduledEvent] = field(default_factory=list)


SCENARIOS: dict[str, Scenario] = {
    "baseline": Scenario(
        name="Baseline GTM Launch",
        description="Standard go-to-market. Market is receptive, competition is low. Agents follow standard playbooks.",
        initial_leads=3,
    ),

    "competitor": Scenario(
        name="Competitor Launch",
        description="A well-funded competitor enters the market. Forces differentiation, pipeline defense, and roadmap acceleration.",
        traffic_modifier=0.8,
        event_probability_modifier=1.5,
        scheduled_events=[
            ScheduledEvent(day=3, name="Competitor Funding Announcement",
                           description="Rival startup raised $50M Series B. They're targeting your exact market segment.",
                           handler="_scenario_competitor_funding"),
            ScheduledEvent(day=7, name="Competitor Feature Parity",
                           description="Competitor launched features matching your product. Customers are comparing.",
                           handler="_scenario_competitor_feature_parity"),
            ScheduledEvent(day=15, name="Competitor Poaching Attempt",
                           description="Competitor is offering discounts to your pipeline leads.",
                           handler="_scenario_competitor_poaching"),
            ScheduledEvent(day=25, name="Competitor PR Blitz",
                           description="Competitor is all over tech press. Your brand awareness is taking a hit.",
                           handler="_scenario_competitor_pr"),
        ],
    ),

    "series_a": Scenario(
        name="Series A Pressure",
        description="Investors demand 3x MRR growth in 90 days. Aggressive coordination mode — every action must drive revenue.",
        budget_modifier=2.0,
        initial_leads=4,
        extra_customers=[
            {"name": "CloudNine Systems", "company_size": "enterprise", "industry": "cloud",
             "budget": 120000.0, "pain_point": "Enterprise SSO and audit logging"},
            {"name": "PayFlow Inc", "company_size": "smb", "industry": "fintech",
             "budget": 25000.0, "pain_point": "PCI compliance and reporting"},
        ],
        scheduled_events=[
            ScheduledEvent(day=1, name="Board Meeting",
                           description="Board demands 3x MRR growth this quarter. All hands on revenue.",
                           handler="_scenario_board_pressure"),
            ScheduledEvent(day=30, name="Investor Check-in",
                           description="Investors reviewing progress. Revenue needs to show traction NOW.",
                           handler="_scenario_investor_checkin"),
            ScheduledEvent(day=60, name="Final Stretch",
                           description="30 days left. If targets aren't met, next round is at risk.",
                           handler="_scenario_final_stretch"),
        ],
    ),

    "churn": Scenario(
        name="Churn Spike",
        description="20% of customers signaling intent to leave. Dev must fix critical bugs while Sales works retention.",
        initial_leads=3,
        initial_nps=25.0,
        initial_satisfaction=0.3,
        initial_stability=0.5,
        extra_bug_reports=[
            {"id": "bug-critical-1", "name": "Data loss on export", "severity": "critical", "reported_day": 1},
            {"id": "bug-critical-2", "name": "Authentication failures", "severity": "critical", "reported_day": 1},
            {"id": "bug-high-1", "name": "Dashboard loading timeout", "severity": "high", "reported_day": 1},
            {"id": "bug-high-2", "name": "API rate limiting broken", "severity": "high", "reported_day": 1},
        ],
        scheduled_events=[
            ScheduledEvent(day=1, name="Churn Warning",
                           description="Support tickets spiking. 20% of customers threatening to cancel.",
                           handler="_scenario_churn_warning"),
            ScheduledEvent(day=5, name="Customer Escalation",
                           description="Key enterprise customer escalated to CEO. Demanding bug fixes within a week.",
                           handler="_scenario_customer_escalation"),
            ScheduledEvent(day=10, name="Churn Begins",
                           description="First customers are actually canceling. Revenue impact starting.",
                           handler="_scenario_churn_begins"),
            ScheduledEvent(day=20, name="Recovery Check",
                           description="Board asking if churn is under control. NPS needs to be above 40.",
                           handler="_scenario_recovery_check"),
        ],
    ),

    "viral": Scenario(
        name="Viral Moment",
        description="Sudden flood of inbound interest. Marketing/Sales overwhelmed. Dev must scale infrastructure fast.",
        traffic_modifier=3.0,
        initial_leads=6,
        extra_customers=[
            {"name": "TrendCorp", "company_size": "enterprise", "industry": "media",
             "budget": 75000.0, "pain_point": "Scalable content management"},
            {"name": "BuzzMetrics", "company_size": "smb", "industry": "analytics",
             "budget": 18000.0, "pain_point": "Real-time dashboard"},
            {"name": "ViralStack", "company_size": "startup", "industry": "saas",
             "budget": 8000.0, "pain_point": "Fast onboarding at scale"},
            {"name": "MegaRetail Corp", "company_size": "enterprise", "industry": "retail",
             "budget": 150000.0, "pain_point": "High-throughput API integration"},
        ],
        extra_backlog=[
            {"id": "scale-1", "name": "Auto-scaling Infrastructure", "description": "Handle 10x traffic spike", "priority": "critical", "requested_by": "operations"},
            {"id": "scale-2", "name": "Rate Limiter v2", "description": "Smart rate limiting for enterprise", "priority": "high", "requested_by": "support"},
        ],
        scheduled_events=[
            ScheduledEvent(day=1, name="Viral Tweet",
                           description="Your product demo went viral on social media. 50K+ views and counting.",
                           handler="_scenario_viral_tweet"),
            ScheduledEvent(day=3, name="Inbound Flood",
                           description="100+ demo requests in queue. Sales can't keep up.",
                           handler="_scenario_inbound_flood"),
            ScheduledEvent(day=7, name="Infrastructure Strain",
                           description="Product is slow under load. Enterprise prospects noticing.",
                           handler="_scenario_infra_strain"),
            ScheduledEvent(day=15, name="Media Coverage",
                           description="TechCrunch wants to write about you. Brand awareness surging.",
                           handler="_scenario_media_coverage"),
        ],
    ),
}


@dataclass
class MinedScenario:
    """A scenario extracted from simulation data at a critical decision point.

    Inspired by EnterpriseSim #73's "Simulate → Mine → Train" pattern.
    Starts agents at a critical moment rather than day 1.
    """
    name: str
    description: str
    source_scenario: str  # Original scenario this was mined from
    trigger_role: str     # Which role's critical moment
    trigger_type: str     # "spike" or "crash"
    start_day: int        # Day to start the mini-scenario
    start_turn: int       # Turn to start from
    window_data: list[dict] = field(default_factory=list)  # Extracted (state, action) window
    target_reward: float = 0.0  # The reward at the critical moment (target to beat or avoid)

    def to_scenario(self) -> Scenario:
        """Convert to a standard Scenario for replay."""
        return Scenario(
            name=f"mined_{self.name}",
            description=f"[Mined from {self.source_scenario}] {self.description}",
            scheduled_events=[
                ScheduledEvent(
                    day=1,
                    name=f"Context: {self.trigger_type} moment for {self.trigger_role}",
                    description=self.description,
                    handler="_scenario_board_pressure",  # Generic handler
                ),
            ],
        )


def get_scenario(name: str) -> Scenario:
    """Get a scenario by name. Defaults to 'baseline'."""
    return SCENARIOS.get(name, SCENARIOS["baseline"])
