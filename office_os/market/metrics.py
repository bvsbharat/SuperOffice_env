"""Reward calculation for Office OS agents."""

from __future__ import annotations

from .config import CONTRACT_TIERS, STAGE_REWARDS
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
            # Small reward for progressing a build
            elif action == "BUILD_FEATURE" and "remaining" in detail:
                reward += 0.5

        elif agent_id == "content":
            # Reward for publishing content
            if "Published" in detail:
                reward += 0.5

        return reward

    def _kpi_delta_reward(self, agent_id: str, prev: dict, current: dict) -> float:
        """Small reward for improving company-wide KPIs."""
        reward = 0.0

        # Traffic improvement
        traffic_delta = current["website_traffic"] - prev["website_traffic"]
        if traffic_delta > 0:
            r = min(traffic_delta / 500.0, 1.0)
            if agent_id in ("marketing", "content"):
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

        return reward

    def _collaboration_bonus(self, state: MarketState, agent_id: str, action_result: dict) -> float:
        """Reward agents for building on each other's work."""
        bonus = 0.0
        detail = action_result.get("detail", "")

        if agent_id == "content":
            # Content writing about a shipped feature = collaboration with Dev
            if any(f.name.lower() in detail.lower() for f in state.shipped_features()):
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

        return penalty
