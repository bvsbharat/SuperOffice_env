"""Reward calculation for Office OS agents."""

from __future__ import annotations

from .config import CONTRACT_TIERS, STAGE_REWARDS, TURNS_PER_DAY
from .state import MarketState


class RewardCalculator:
    """Calculates per-agent rewards based on state changes."""

    def __init__(self):
        self._prev_kpis: dict | None = None

    def snapshot(self, state: MarketState):
        """Take a snapshot of current KPIs for delta calculation."""
        self._prev_kpis = state.get_all_kpis()

    def calculate(self, state: MarketState, agent_id: str, action_result: dict) -> float:
        """Calculate reward for an agent after their action."""
        reward = 0.0

        # 1. Pipeline stage transition rewards (scaled by contract tier for closed deals)
        for customer in state.customers_that_moved_stage():
            stage_rewards = STAGE_REWARDS.get(customer.stage, {})
            base = stage_rewards.get(agent_id, 0.0)
            if customer.stage == "closed_won" and customer.contract_tier:
                tier = CONTRACT_TIERS.get(customer.contract_tier, {})
                base *= tier.get("multiplier", 1.0)
            reward += base

        # 2. KPI delta rewards
        if self._prev_kpis:
            current = state.get_all_kpis()
            reward += self._kpi_delta_reward(agent_id, self._prev_kpis, current)

        # 3. Direct action rewards (Dev shipping, etc.)
        reward += self._action_reward(agent_id, action_result)

        # 4. Action success/failure
        if not action_result.get("success", True):
            reward -= 1.0

        # 5. Collaboration bonus -- check if action builds on another agent's work
        reward += self._collaboration_bonus(state, agent_id, action_result)

        # 6. Constraint penalties
        reward += self._constraint_penalties(state, agent_id, action_result)

        # 7. Small shaping reward so most turns aren't zero
        # Ensures GRPO gets gradient signal even on "maintenance" turns
        if action_result.get("success", True):
            reward += 0.1  # Base reward for any successful action

        # Take new snapshot for next calculation
        self._prev_kpis = state.get_all_kpis()

        return round(reward, 2)

    def _action_reward(self, agent_id: str, action_result: dict) -> float:
        """Direct rewards for impactful actions."""
        if not action_result.get("success", True):
            return 0.0

        reward = 0.0
        detail = action_result.get("detail", "")
        action = action_result.get("action_type", "")

        if agent_id == "dev":
            # Reward for shipping features
            if action == "SHIP_RELEASE" and "Shipped" in detail:
                reward += 3.0
            # Reward for completing a build
            elif action == "BUILD_FEATURE" and "ready to ship" in detail:
                reward += 1.0
            # Small reward for progressing a build
            elif action == "BUILD_FEATURE" and "remaining" in detail:
                reward += 0.5
            # Rewards for maintenance actions — higher for customer-reported bugs
            elif action == "FIX_BUG":
                reward += 0.8
                # Empathy bonus: fixing customer-reported bugs shows responsiveness
                if "customer" in detail.lower() or "escalat" in detail.lower():
                    reward += 0.5
            elif action == "REFACTOR":
                reward += 0.5
            elif action == "WRITE_DOCS":
                reward += 0.3
            elif action == "REVIEW_PR":
                reward += 0.3

        elif agent_id == "content":
            # Reward for publishing content (multi-turn completion)
            if "Published" in detail:
                reward += 0.3
            # Small reward for making progress on content
            elif "turns remaining" in detail or "Started writing" in detail:
                reward += 0.2

        elif agent_id == "ceo":
            # Reward for setting OKRs and strategic actions
            if action == "SET_OKRS":
                reward += 1.0
            elif action == "SEND_DIRECTIVE":
                reward += 0.3

        elif agent_id == "hr":
            # Reward for boosting velocity
            if "Velocity" in detail or "velocity" in detail:
                reward += 1.0
            elif action == "PLAN_SPRINT":
                reward += 0.5
            elif action == "RESOLVE_BLOCKER":
                reward += 1.5

        elif agent_id == "sales":
            # Empathy bonus: following up on feedback or when satisfaction is low
            if action == "FOLLOW_UP":
                reward += 0.3
            elif action == "COLLECT_FEEDBACK":
                reward += 0.5
            elif action == "UPDATE_SHEET":
                reward += 0.3

        elif agent_id == "customer":
            # Reward for realistic customer behavior
            if action == "REFER_LEAD" and "New lead" in detail:
                reward += 1.0
            elif action == "RENEW_CONTRACT" and "renewed" in detail:
                reward += 1.5
            elif action == "EVALUATE_PRODUCT":
                reward += 0.3
            elif action == "GIVE_FEEDBACK":
                reward += 0.5
            # Reward for escalating real issues (drives dev to fix bugs)
            elif action == "ESCALATE_ISSUE":
                reward += 0.4
            # Reward for requesting features (drives product development)
            elif action == "REQUEST_FEATURE":
                reward += 0.3

        return reward

    def _kpi_delta_reward(self, agent_id: str, prev: dict, current: dict) -> float:
        """Small reward for improving company-wide KPIs."""
        reward = 0.0

        # Traffic improvement
        traffic_delta = current["website_traffic"] - prev["website_traffic"]
        if traffic_delta > 0:
            r = min(traffic_delta / 500.0, 1.0)
            if agent_id == "content":
                # Diminishing returns after 5 published pieces
                published_count = current.get("content_published", 0)
                if published_count > 5:
                    r *= max(0.2, 1.0 - (published_count - 5) * 0.15)
                reward += r
            elif agent_id == "marketing":
                reward += r
            else:
                reward += r * 0.2  # Everyone benefits a little

        # Revenue improvement
        rev_delta = current["revenue"] - prev["revenue"]
        if rev_delta > 0:
            r = min(rev_delta / 5000.0, 2.0)
            if agent_id == "sales":
                reward += r * 2.0
            else:
                reward += r * 0.5

        # Pipeline growth
        pipe_delta = current["pipeline_value"] - prev["pipeline_value"]
        if pipe_delta > 0:
            if agent_id == "sales":
                reward += min(pipe_delta / 10000.0, 1.0)

        # Stability improvement reward for dev
        if agent_id == "dev":
            stability_delta = current.get("product_stability", 0) - prev.get("product_stability", 0)
            if stability_delta > 0:
                reward += min(stability_delta * 15.0, 1.5)

        # Customer satisfaction delta — rewards empathy across ALL roles
        sat_delta = current.get("customer_satisfaction", 0) - prev.get("customer_satisfaction", 0)
        if sat_delta > 0:
            # Everyone gets rewarded when customer satisfaction improves
            reward += sat_delta * 2.0  # e.g. +0.1 satisfaction = +0.2 reward
        elif sat_delta < 0:
            # Penalize roles responsible for customer-facing quality
            if agent_id in ("dev", "sales", "ceo"):
                reward += sat_delta * 1.5  # e.g. -0.1 satisfaction = -0.15 penalty

        # NPS improvement — reward for turning detractors into promoters
        nps_delta = current.get("nps_score", 0) - prev.get("nps_score", 0)
        if nps_delta > 0:
            reward += min(nps_delta / 20.0, 0.5)  # +20 NPS = +0.5 reward
        elif nps_delta < -5:
            # Significant NPS drop penalizes customer-facing roles
            if agent_id in ("dev", "sales", "customer"):
                reward -= 0.3

        return reward

    def _collaboration_bonus(self, state: MarketState, agent_id: str, action_result: dict) -> float:
        """Reward agents for building on each other's work."""
        bonus = 0.0
        detail = action_result.get("detail", "")

        if agent_id == "content":
            # Content writing about a shipped feature = collaboration with Dev
            # Requires explicit "feature" parameter matching a shipped feature name
            feature_param = action_result.get("parameters", {})
            if isinstance(feature_param, dict):
                ref_feature = feature_param.get("feature", "")
                if ref_feature:
                    shipped_names = [f.name.lower() for f in state.shipped_features()]
                    if ref_feature.lower() in shipped_names:
                        bonus += 1.0

        if agent_id == "sales":
            # Sales using content in a demo = collaboration with Content
            for customer in state.active_leads():
                if customer.content_touchpoints:
                    bonus += 0.5
                    break

        if agent_id == "dev":
            # Dev building a feature from customer feedback = collaboration with Sales
            for fb in state.feedback:
                if fb.get("content", "").lower() in detail.lower():
                    bonus += 1.0
                    break

        if agent_id == "marketing":
            # Marketing promoting content = collaboration with Content
            if state.content_pieces and "campaign" in action_result.get("action_type", "").lower():
                bonus += 0.5

        # Churn prevention bonus — reward any role for acting when satisfaction is low
        if state.customer_satisfaction < 0.4:
            action = action_result.get("action_type", "")
            # Dev fixing bugs when customers are unhappy
            if agent_id == "dev" and action in ("FIX_BUG", "REFACTOR"):
                bonus += 0.5
            # Sales following up or collecting feedback during low satisfaction
            elif agent_id == "sales" and action in ("FOLLOW_UP", "COLLECT_FEEDBACK"):
                bonus += 0.5
            # CEO reviewing strategy or sending directives during crisis
            elif agent_id == "ceo" and action in ("REVIEW_STRATEGY", "SEND_DIRECTIVE"):
                bonus += 0.3
            # HR resolving blockers during crisis
            elif agent_id == "hr" and action == "RESOLVE_BLOCKER":
                bonus += 0.5

        return bonus

    def _constraint_penalties(self, state: MarketState, agent_id: str, action_result: dict) -> float:
        """Apply penalties for constraint violations."""
        penalty = 0.0

        # Vaporware penalty (already handled in simulator, but double-check)
        if not action_result.get("success") and "unshipped feature" in action_result.get("detail", ""):
            penalty -= 5.0

        # Stale lead penalty for Sales
        if agent_id == "sales":
            stale = [c for c in state.active_leads()
                     if (state.day - c.last_contacted_day) > 4]
            if stale:
                penalty -= 0.5 * len(stale)

        # Budget overrun awareness for Marketing
        if agent_id == "marketing" and state.budget_remaining < 1000:
            penalty -= 0.5  # Gentle nudge to be careful

        # Sales penalty for not updating Google Sheet by end of day
        if agent_id == "sales" and state.turn % TURNS_PER_DAY == 0 and not state._sheet_updated_today:
            penalty -= 1.0

        return penalty
