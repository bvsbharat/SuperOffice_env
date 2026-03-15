"""Reward calculation for Office OS agents.

Decomposed into explicit sub-signals (inspired by OpsGate #4's graduated reward):
- Format reward: valid action with required fields
- Role compliance: action matches role's allowed set
- Execution reward: action succeeded in simulator
- Impact reward: KPI improvement from this action
- Collaboration reward: cross-agent synergy
- Efficiency penalty: repetitive actions
"""

from __future__ import annotations

from .config import CONTRACT_TIERS, ROLE_ACTIONS, STAGE_REWARDS, TURNS_PER_DAY
from .state import MarketState


class RewardCalculator:
    """Calculates per-agent rewards with decomposed sub-signals."""

    def __init__(self):
        self._prev_kpis: dict | None = None
        self._action_history: dict[str, list[str]] = {}  # role -> recent action types

    def snapshot(self, state: MarketState):
        """Take a snapshot of current KPIs for delta calculation."""
        self._prev_kpis = state.get_all_kpis()

    def calculate(self, state: MarketState, agent_id: str, action_result: dict) -> float:
        """Calculate reward for an agent after their action (backward-compatible scalar)."""
        breakdown = self.calculate_decomposed(state, agent_id, action_result)
        return round(breakdown["total"], 2)

    def calculate_decomposed(self, state: MarketState, agent_id: str, action_result: dict) -> dict:
        """Calculate decomposed reward signals. Returns dict with all sub-signals + total."""
        action_type = action_result.get("action_type", "")

        # 1. Format reward: valid JSON action with required fields
        format_reward = 0.1 if action_type else 0.0

        # 2. Role compliance: action is in this role's allowed set
        role_compliance = 0.2 if action_type in ROLE_ACTIONS.get(agent_id, []) else -0.5

        # 3. Execution reward: action succeeded in simulator
        success = action_result.get("success", True)
        execution_reward = 0.3 if success else -1.0

        # 4. Impact reward: KPI deltas + stage transitions + action-specific rewards
        impact_reward = 0.0
        # Stage transition rewards (scaled by contract tier)
        for customer in state.customers_that_moved_stage():
            stage_rewards = STAGE_REWARDS.get(customer.stage, {})
            base = stage_rewards.get(agent_id, 0.0)
            if customer.stage == "closed_won" and customer.contract_tier:
                tier = CONTRACT_TIERS.get(customer.contract_tier, {})
                base *= tier.get("multiplier", 1.0)
            impact_reward += base
        # KPI delta rewards
        if self._prev_kpis:
            current = state.get_all_kpis()
            impact_reward += self._kpi_delta_reward(agent_id, self._prev_kpis, current)
        # Direct action rewards
        impact_reward += self._action_reward(agent_id, action_result)
        # Constraint penalties
        impact_reward += self._constraint_penalties(state, agent_id, action_result)
        # Clamp impact to [0, 1] for the normalized signal but keep raw for total
        impact_normalized = max(0.0, min(1.0, impact_reward / 10.0)) if impact_reward > 0 else impact_reward

        # 5. Collaboration reward
        collaboration_reward = self._collaboration_bonus(state, agent_id, action_result)

        # 6. Efficiency penalty: repeated same action type 3+ times in a row
        efficiency_penalty = 0.0
        history = self._action_history.setdefault(agent_id, [])
        history.append(action_type)
        if len(history) >= 3 and len(set(history[-3:])) == 1:
            efficiency_penalty = -0.1
        # Keep only last 5 actions per agent
        if len(history) > 5:
            self._action_history[agent_id] = history[-5:]

        # Take new snapshot for next calculation
        self._prev_kpis = state.get_all_kpis()

        # Total matches old formula: base(0.1) + role(0.2) + exec(0.3) + impact + collab + efficiency
        total = format_reward + role_compliance + execution_reward + impact_reward + collaboration_reward + efficiency_penalty

        return {
            "format_reward": round(format_reward, 3),
            "role_compliance": round(role_compliance, 3),
            "execution_reward": round(execution_reward, 3),
            "impact_reward": round(impact_reward, 3),
            "impact_normalized": round(impact_normalized, 3),
            "collaboration_reward": round(collaboration_reward, 3),
            "efficiency_penalty": round(efficiency_penalty, 3),
            "total": round(total, 3),
        }

    def _action_reward(self, agent_id: str, action_result: dict) -> float:
        """Direct rewards for impactful actions."""
        if not action_result.get("success", True):
            return 0.0

        reward = 0.0
        detail = action_result.get("detail", "")
        action = action_result.get("action_type", "")

        if agent_id == "dev":
            if action == "SHIP_RELEASE" and "Shipped" in detail:
                reward += 3.0
            elif action == "BUILD_FEATURE" and "ready to ship" in detail:
                reward += 1.0
            elif action == "BUILD_FEATURE" and "remaining" in detail:
                reward += 0.5
            elif action == "FIX_BUG":
                reward += 0.8
                if "customer" in detail.lower() or "escalat" in detail.lower():
                    reward += 0.5
            elif action == "REFACTOR":
                reward += 0.5
            elif action == "WRITE_DOCS":
                reward += 0.3
            elif action == "REVIEW_PR":
                reward += 0.3

        elif agent_id == "content":
            if "Published" in detail:
                reward += 0.3
            elif "turns remaining" in detail or "Started writing" in detail:
                reward += 0.2

        elif agent_id == "ceo":
            if action == "SET_OKRS":
                reward += 1.0
            elif action == "SEND_DIRECTIVE":
                reward += 0.3

        elif agent_id == "hr":
            if "Velocity" in detail or "velocity" in detail:
                reward += 1.0
            elif action == "PLAN_SPRINT":
                reward += 0.5
            elif action == "RESOLVE_BLOCKER":
                reward += 1.5

        elif agent_id == "sales":
            if action == "FOLLOW_UP":
                reward += 0.3
            elif action == "COLLECT_FEEDBACK":
                reward += 0.5
            elif action == "UPDATE_SHEET":
                reward += 0.3

        elif agent_id == "customer":
            if action == "REFER_LEAD" and "New lead" in detail:
                reward += 1.0
            elif action == "RENEW_CONTRACT" and "renewed" in detail:
                reward += 1.5
            elif action == "EVALUATE_PRODUCT":
                reward += 0.3
            elif action == "GIVE_FEEDBACK":
                reward += 0.5
            elif action == "ESCALATE_ISSUE":
                reward += 0.4
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
                published_count = current.get("content_published", 0)
                if published_count > 5:
                    r *= max(0.2, 1.0 - (published_count - 5) * 0.15)
                reward += r
            elif agent_id == "marketing":
                reward += r
            else:
                reward += r * 0.2

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

        # Customer satisfaction delta
        sat_delta = current.get("customer_satisfaction", 0) - prev.get("customer_satisfaction", 0)
        if sat_delta > 0:
            reward += sat_delta * 2.0
        elif sat_delta < 0:
            if agent_id in ("dev", "sales", "ceo"):
                reward += sat_delta * 1.5

        # NPS improvement
        nps_delta = current.get("nps_score", 0) - prev.get("nps_score", 0)
        if nps_delta > 0:
            reward += min(nps_delta / 20.0, 0.5)
        elif nps_delta < -5:
            if agent_id in ("dev", "sales", "customer"):
                reward -= 0.3

        return reward

    def _collaboration_bonus(self, state: MarketState, agent_id: str, action_result: dict) -> float:
        """Reward agents for building on each other's work."""
        bonus = 0.0
        detail = action_result.get("detail", "")

        if agent_id == "content":
            feature_param = action_result.get("parameters", {})
            if isinstance(feature_param, dict):
                ref_feature = feature_param.get("feature", "")
                if ref_feature:
                    shipped_names = [f.name.lower() for f in state.shipped_features()]
                    if ref_feature.lower() in shipped_names:
                        bonus += 1.0

        if agent_id == "sales":
            for customer in state.active_leads():
                if customer.content_touchpoints:
                    bonus += 0.5
                    break

        if agent_id == "dev":
            for fb in state.feedback:
                if fb.get("content", "").lower() in detail.lower():
                    bonus += 1.0
                    break

        if agent_id == "marketing":
            if state.content_pieces and "campaign" in action_result.get("action_type", "").lower():
                bonus += 0.5

        # Churn prevention bonus
        if state.customer_satisfaction < 0.4:
            action = action_result.get("action_type", "")
            if agent_id == "dev" and action in ("FIX_BUG", "REFACTOR"):
                bonus += 0.5
            elif agent_id == "sales" and action in ("FOLLOW_UP", "COLLECT_FEEDBACK"):
                bonus += 0.5
            elif agent_id == "ceo" and action in ("REVIEW_STRATEGY", "SEND_DIRECTIVE"):
                bonus += 0.3
            elif agent_id == "hr" and action == "RESOLVE_BLOCKER":
                bonus += 0.5

        return bonus

    def _constraint_penalties(self, state: MarketState, agent_id: str, action_result: dict) -> float:
        """Apply penalties for constraint violations."""
        penalty = 0.0

        if not action_result.get("success") and "unshipped feature" in action_result.get("detail", ""):
            penalty -= 5.0

        if agent_id == "sales":
            stale = [c for c in state.active_leads()
                     if (state.day - c.last_contacted_day) > 4]
            if stale:
                penalty -= 0.5 * len(stale)

        if agent_id == "marketing" and state.budget_remaining < 1000:
            penalty -= 0.5

        if agent_id == "sales" and state.turn % TURNS_PER_DAY == 0 and not state._sheet_updated_today:
            penalty -= 1.0

        return penalty
