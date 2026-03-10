"""Dynamic market event generator with adversarial curriculum design.

Includes the AdversarialEventDesigner (inspired by Kube SRE Gym #51 winner)
which analyzes agent performance and generates targeted challenges.
"""

from __future__ import annotations

from dataclasses import dataclass, field
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
    """Generates and applies random market events and scenario-scheduled events."""

    def __init__(self, scenario_name: str = "baseline"):
        self.cfg = Config()
        self._scenario_name = scenario_name
        self._fired_scheduled: set[int] = set()  # Track which scheduled events already fired

        from .scenarios import get_scenario
        self._scenario = get_scenario(scenario_name)

    def tick(self, state: MarketState) -> list[MarketEvent]:
        """Called each turn. May generate events at the start of each day."""
        events = []
        # Only generate events at the start of a new day
        if state.turn % 10 != 0 or state.turn == 0:
            return events

        # Fire scheduled scenario events
        for i, sched in enumerate(self._scenario.scheduled_events):
            if sched.day == state.day and i not in self._fired_scheduled:
                self._fired_scheduled.add(i)
                event = MarketEvent(
                    id=str(uuid4())[:8],
                    name=sched.name,
                    description=sched.description,
                    day=state.day,
                    effects={},
                )
                handler = getattr(self, sched.handler, None)
                if handler:
                    handler(state, event)
                state.active_events.append({
                    "id": event.id,
                    "name": event.name,
                    "description": event.description,
                    "day": event.day,
                })
                events.append(event)

        # Random events (probability may be modified by scenario)
        prob = self.cfg.event_probability * self._scenario.event_probability_modifier
        if state._rng.random() < prob:
            template = state._rng.choice(EVENT_TEMPLATES)
            event = MarketEvent(
                id=str(uuid4())[:8],
                name=template["name"],
                description=template["description"],
                day=state.day,
                effects={},
            )
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

    # ── Competitor Launch scenario handlers ──────────────────────────

    def _scenario_competitor_funding(self, state: MarketState, event: MarketEvent):
        """Well-funded competitor announced."""
        state.brand_awareness = max(0, state.brand_awareness - 5)
        for c in state.active_leads():
            if state._rng.random() < 0.3:
                c.objections.append("Competitor just raised $50M — are you keeping up?")
        event.effects = {"brand_hit": 5, "leads_at_risk": True}

    def _scenario_competitor_feature_parity(self, state: MarketState, event: MarketEvent):
        """Competitor matched your features."""
        state.website_traffic = max(100, state.website_traffic - state._rng.randint(100, 400))
        state.conversion_rate = max(0.005, state.conversion_rate - 0.005)
        for c in state.active_leads():
            c.objections.append("Competitor has similar features now")
        state.backlog.append({
            "id": "diff-1", "name": "Unique Differentiator",
            "description": "Build something the competitor can't match",
            "priority": "critical", "requested_by": "strategy",
        })
        event.effects = {"traffic_lost": True, "conversion_drop": True}

    def _scenario_competitor_poaching(self, state: MarketState, event: MarketEvent):
        """Competitor offering discounts to your leads."""
        for c in state.active_leads():
            if state._rng.random() < 0.4:
                c.objections.append("Competitor offering 50% discount")
                c.satisfaction = max(0, c.satisfaction - 0.2)
        event.effects = {"leads_under_attack": True}

    def _scenario_competitor_pr(self, state: MarketState, event: MarketEvent):
        """Competitor dominating press coverage."""
        state.brand_awareness = max(0, state.brand_awareness - 10)
        state.website_traffic = max(100, state.website_traffic - state._rng.randint(200, 500))
        event.effects = {"brand_hit": 10, "traffic_lost": True}

    # ── Series A Pressure scenario handlers ──────────────────────────

    def _scenario_board_pressure(self, state: MarketState, event: MarketEvent):
        """Board demands aggressive revenue growth."""
        state.shared_memory.post(
            "system", "alert",
            "BOARD DIRECTIVE: 3x MRR growth required this quarter. Every action must drive revenue.",
            state.day, state.turn,
        )
        event.effects = {"pressure": "3x_mrr"}

    def _scenario_investor_checkin(self, state: MarketState, event: MarketEvent):
        """Investor mid-quarter review."""
        state.shared_memory.post(
            "system", "alert",
            f"INVESTOR CHECK-IN: Current MRR is ${state.revenue:,.0f}. Target is ${state.revenue * 3:,.0f}. Are we on track?",
            state.day, state.turn,
        )
        if state.total_revenue < 5000:
            state.brand_awareness = max(0, state.brand_awareness - 5)
        event.effects = {"revenue_reviewed": state.total_revenue}

    def _scenario_final_stretch(self, state: MarketState, event: MarketEvent):
        """Final 30 days — make or break."""
        state.shared_memory.post(
            "system", "alert",
            "FINAL STRETCH: 30 days left. Close every deal possible. Ship all pending features.",
            state.day, state.turn,
        )
        state.budget_remaining += 5000  # Emergency budget injection
        event.effects = {"emergency_budget": 5000}

    # ── Churn Spike scenario handlers ────────────────────────────────

    def _scenario_churn_warning(self, state: MarketState, event: MarketEvent):
        """20% of customers signaling churn."""
        state.shared_memory.post(
            "system", "alert",
            "CHURN ALERT: 20% of customers threatening to cancel. Critical bugs must be fixed ASAP.",
            state.day, state.turn,
        )
        state.nps_score = min(state.nps_score, 25)
        event.effects = {"churn_risk": "20%"}

    def _scenario_customer_escalation(self, state: MarketState, event: MarketEvent):
        """Enterprise customer escalates to CEO."""
        for c in state.customers:
            if c.company_size == "enterprise" and c.stage not in ("closed_lost", "churned"):
                c.objections.append("Escalated to CEO — demanding urgent bug fixes")
                c.satisfaction = max(0, c.satisfaction - 0.3)
                state.shared_memory.post(
                    "system", "alert",
                    f"ESCALATION: {c.name} demands critical fixes within 7 days or they cancel.",
                    state.day, state.turn,
                )
                break
        event.effects = {"escalation": True}

    def _scenario_churn_begins(self, state: MarketState, event: MarketEvent):
        """First customers actually cancel."""
        churned = 0
        for c in state.customers:
            if c.stage == "closed_won" and state._rng.random() < 0.2:
                c.previous_stage = c.stage
                c.stage = "churned"
                state._stage_transitions.append(c)
                churned += 1
                if churned >= 2:
                    break
        state.nps_score = max(0, state.nps_score - 10)
        event.effects = {"customers_churned": churned}

    def _scenario_recovery_check(self, state: MarketState, event: MarketEvent):
        """Board checking if churn is under control."""
        state.shared_memory.post(
            "system", "alert",
            f"RECOVERY CHECK: NPS is {state.nps_score:.0f}. Need above 40 to satisfy board.",
            state.day, state.turn,
        )
        event.effects = {"nps": state.nps_score}

    # ── Viral Moment scenario handlers ───────────────────────────────

    def _scenario_viral_tweet(self, state: MarketState, event: MarketEvent):
        """Product demo goes viral."""
        boost = state._rng.randint(2000, 5000)
        state.website_traffic += boost
        state.brand_awareness = min(100, state.brand_awareness + 20)
        # Spawn extra leads
        for _ in range(state._rng.randint(3, 6)):
            customer = state.maybe_spawn_customer()
            if customer:
                customer.source = "viral"
                customer.previous_stage = "visitor"
                customer.stage = "lead"
                state._stage_transitions.append(customer)
        event.effects = {"traffic_boost": boost}

    def _scenario_inbound_flood(self, state: MarketState, event: MarketEvent):
        """100+ demo requests flooding in."""
        state.shared_memory.post(
            "system", "alert",
            "INBOUND FLOOD: 100+ demo requests in queue. Sales needs help prioritizing. Marketing: pause ad spend.",
            state.day, state.turn,
        )
        for _ in range(state._rng.randint(4, 8)):
            customer = state.maybe_spawn_customer()
            if customer:
                customer.source = "viral"
                customer.previous_stage = "visitor"
                customer.stage = "lead"
                state._stage_transitions.append(customer)
        event.effects = {"inbound_overload": True}

    def _scenario_infra_strain(self, state: MarketState, event: MarketEvent):
        """Product slow under load."""
        state.product_stability = max(0.3, state.product_stability - 0.3)
        state.nps_score = max(0, state.nps_score - 15)
        state.bug_reports.append({
            "id": "infra-1", "name": "Performance degradation under load",
            "severity": "critical", "reported_day": state.day,
        })
        state.shared_memory.post(
            "system", "alert",
            "INFRASTRUCTURE: Product is slow under 10x traffic. Enterprise prospects complaining.",
            state.day, state.turn,
        )
        event.effects = {"stability_drop": 0.3}

    def _scenario_media_coverage(self, state: MarketState, event: MarketEvent):
        """TechCrunch writing about you."""
        state.brand_awareness = min(100, state.brand_awareness + 25)
        state.website_traffic += state._rng.randint(3000, 8000)
        state.shared_memory.post(
            "system", "alert",
            "MEDIA: TechCrunch feature article incoming. Expect another wave of inbound.",
            state.day, state.turn,
        )
        event.effects = {"media_boost": True}


# ── Adversarial Curriculum Designer (inspired by Kube SRE Gym #51) ────────

ADVERSARIAL_TEMPLATES = {
    "sales_too_easy": [
        {
            "name": "Competitor Undercut",
            "description": "A competitor is offering 40% discount to your pipeline leads.",
            "apply": "_adv_competitor_undercut",
        },
        {
            "name": "Budget Freeze",
            "description": "Several prospects announced budget freezes due to market uncertainty.",
            "apply": "_adv_budget_freeze",
        },
    ],
    "dev_ignoring_stability": [
        {
            "name": "Critical Production Outage",
            "description": "Major production outage reported. Multiple customers affected.",
            "apply": "_adv_critical_outage",
        },
        {
            "name": "Security Vulnerability",
            "description": "Security researcher reported a critical vulnerability in your API.",
            "apply": "_adv_security_vuln",
        },
    ],
    "marketing_overspending": [
        {
            "name": "Budget Audit",
            "description": "Board is auditing marketing spend. ROI per campaign under scrutiny.",
            "apply": "_adv_budget_audit",
        },
        {
            "name": "Ad Platform Rate Hike",
            "description": "Ad platform increased CPM by 50%. Campaign costs are rising.",
            "apply": "_adv_ad_rate_hike",
        },
    ],
    "content_stagnating": [
        {
            "name": "Content Fatigue",
            "description": "Blog traffic dropping. Audience wants fresh, differentiated content.",
            "apply": "_adv_content_fatigue",
        },
    ],
    "low_collaboration": [
        {
            "name": "Team Misalignment",
            "description": "CEO noticed departments working in silos. Alignment meeting required.",
            "apply": "_adv_team_misalignment",
        },
    ],
}


class AdversarialEventDesigner:
    """Analyzes agent performance and generates targeted challenges.

    Tracks per-role cumulative rewards and weaknesses, then injects events
    that specifically target areas where agents are performing too well
    (to prevent exploitation) or too poorly (to force learning).

    Difficulty escalates as cumulative reward increases.
    """

    def __init__(self):
        self.cfg = Config()
        self._cumulative_rewards: dict[str, float] = {}
        self._action_counts: dict[str, dict[str, int]] = {}  # role -> {action: count}
        self._difficulty_level: float = 1.0

    def track_reward(self, role: str, reward: float, action_type: str = ""):
        """Track an agent's reward and action for weakness analysis."""
        self._cumulative_rewards[role] = self._cumulative_rewards.get(role, 0.0) + reward
        if action_type:
            role_actions = self._action_counts.setdefault(role, {})
            role_actions[action_type] = role_actions.get(action_type, 0) + 1

        # Escalate difficulty based on total cumulative reward
        total_reward = sum(self._cumulative_rewards.values())
        escalation_steps = max(0, total_reward / self.cfg.adversarial_reward_threshold)
        self._difficulty_level = 1.0 + escalation_steps * self.cfg.adversarial_escalation_rate

    def generate_events(self, state: MarketState) -> list[MarketEvent]:
        """Analyze performance and generate targeted adversarial events."""
        if not self.cfg.adversarial_enabled:
            return []

        # Only check at start of day
        if state.turn % 10 != 0 or state.turn == 0:
            return []

        prob = self.cfg.adversarial_base_probability * self._difficulty_level
        if state._rng.random() > prob:
            return []

        weaknesses = self._identify_weaknesses(state)
        if not weaknesses:
            return []

        # Pick a weakness to target
        weakness = state._rng.choice(weaknesses)
        templates = ADVERSARIAL_TEMPLATES.get(weakness, [])
        if not templates:
            return []

        template = state._rng.choice(templates)
        event = MarketEvent(
            id=str(uuid4())[:8],
            name=f"[ADVERSARIAL] {template['name']}",
            description=template["description"],
            day=state.day,
            effects={"adversarial": True, "weakness_targeted": weakness, "difficulty": self._difficulty_level},
        )

        handler = getattr(self, template["apply"], None)
        if handler:
            handler(state, event)

        state.active_events.append({
            "id": event.id,
            "name": event.name,
            "description": event.description,
            "day": event.day,
        })

        return [event]

    def _identify_weaknesses(self, state: MarketState) -> list[str]:
        """Identify agent weaknesses to target."""
        weaknesses = []

        # Sales closing too easily: high close rate without much effort
        sales_reward = self._cumulative_rewards.get("sales", 0)
        sales_actions = self._action_counts.get("sales", {})
        close_count = sales_actions.get("CLOSE_DEAL", 0)
        if sales_reward > 15 and close_count > 2:
            weaknesses.append("sales_too_easy")

        # Dev ignoring stability: many features but low stability
        if state.product_stability < 0.6 and len(state.shipped_features()) > 2:
            weaknesses.append("dev_ignoring_stability")

        # Marketing overspending: low budget, many campaigns
        marketing_actions = self._action_counts.get("marketing", {})
        campaign_count = marketing_actions.get("LAUNCH_CAMPAIGN", 0) + marketing_actions.get("RUN_AD", 0)
        if state.budget_remaining < 5000 and campaign_count > 3:
            weaknesses.append("marketing_overspending")

        # Content stagnating: low traffic growth despite content
        if len([p for p in state.content_pieces if p.published]) > 3 and state.website_traffic < 2000:
            weaknesses.append("content_stagnating")

        # Low collaboration: check shared memory for cross-role communication
        recent_entries = state.shared_memory.entries[-20:] if state.shared_memory.entries else []
        unique_authors = set(e.author for e in recent_entries)
        if len(unique_authors) < 3 and state.day > 5:
            weaknesses.append("low_collaboration")

        return weaknesses

    def get_stats(self) -> dict:
        return {
            "difficulty_level": round(self._difficulty_level, 2),
            "cumulative_rewards": {k: round(v, 2) for k, v in self._cumulative_rewards.items()},
            "action_counts": dict(self._action_counts),
        }

    # ── Adversarial event handlers ────────────────────────────────

    def _adv_competitor_undercut(self, state: MarketState, event: MarketEvent):
        for c in state.active_leads():
            if state._rng.random() < 0.3:
                c.objections.append("Competitor offering 40% discount")
                c.satisfaction = max(0, c.satisfaction - 0.15)
        event.effects["leads_threatened"] = len(state.active_leads())

    def _adv_budget_freeze(self, state: MarketState, event: MarketEvent):
        for c in state.active_leads():
            if c.stage in ("proposal", "negotiation") and state._rng.random() < 0.4:
                c.objections.append("Budget freeze — decision delayed")
        state.shared_memory.post(
            "system", "alert",
            "MARKET: Multiple prospects reporting budget freezes. Sales cycle may extend.",
            state.day, state.turn,
        )

    def _adv_critical_outage(self, state: MarketState, event: MarketEvent):
        state.product_stability = max(0.2, state.product_stability - 0.25)
        state.nps_score = max(0, state.nps_score - 15)
        state.customer_satisfaction = max(0, state.customer_satisfaction - 0.2)
        state.bug_reports.append({
            "id": f"outage-{state.day}",
            "name": "Critical production outage",
            "severity": "critical",
            "reported_day": state.day,
        })
        state.shared_memory.post(
            "system", "alert",
            "OUTAGE: Critical production issue. All hands on deck. Dev must prioritize stability.",
            state.day, state.turn,
        )

    def _adv_security_vuln(self, state: MarketState, event: MarketEvent):
        state.product_stability = max(0.3, state.product_stability - 0.15)
        state.bug_reports.append({
            "id": f"sec-{state.day}",
            "name": "Critical API security vulnerability",
            "severity": "critical",
            "reported_day": state.day,
        })
        for c in state.active_leads():
            if c.company_size == "enterprise":
                c.objections.append("Concerned about security vulnerability")

    def _adv_budget_audit(self, state: MarketState, event: MarketEvent):
        state.shared_memory.post(
            "system", "alert",
            "AUDIT: Board reviewing marketing ROI. Justify all campaign spend. Consider organic channels.",
            state.day, state.turn,
        )
        # Reduce budget as a penalty for overspending
        cut = state.budget_remaining * 0.15
        state.budget_remaining -= cut
        event.effects["budget_cut"] = cut

    def _adv_ad_rate_hike(self, state: MarketState, event: MarketEvent):
        state.shared_memory.post(
            "system", "alert",
            "COST ALERT: Ad platform CPM increased 50%. Consider shifting to content-driven leads.",
            state.day, state.turn,
        )

    def _adv_content_fatigue(self, state: MarketState, event: MarketEvent):
        state.website_traffic = max(500, state.website_traffic - state._rng.randint(200, 500))
        state.brand_awareness = max(0, state.brand_awareness - 3)
        state.shared_memory.post(
            "system", "insight",
            "ANALYTICS: Blog engagement dropping. Audience wants case studies and data-driven content.",
            state.day, state.turn,
        )

    def _adv_team_misalignment(self, state: MarketState, event: MarketEvent):
        state.team_velocity = max(0.5, state.team_velocity - 0.15)
        state.shared_memory.post(
            "system", "alert",
            "CEO NOTICE: Departments working in silos. Need cross-team coordination. HR: schedule alignment meeting.",
            state.day, state.turn,
        )
