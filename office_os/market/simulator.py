"""Market simulation engine -- executes agent actions and updates state."""

from __future__ import annotations

from uuid import uuid4

from .config import Config, CONTRACT_TIERS, ROLE_ACTIONS
from .state import (
    Campaign,
    ContentPiece,
    Customer,
    Feature,
    MarketState,
    Message,
)


class MarketSimulator:
    """Processes agent actions and updates market state."""

    def __init__(self, state: MarketState):
        self.state = state
        self.cfg = Config()

    def execute_action(self, agent_id: str, action_type: str, target: str, parameters: dict, message: str | None) -> dict:
        """Execute an agent's action and return a result summary."""
        role = agent_id  # agent_id is the role name
        result = {"agent_id": agent_id, "action_type": action_type, "success": True, "detail": ""}

        # Validate action is allowed for this role
        if action_type not in ROLE_ACTIONS.get(role, []):
            result["success"] = False
            result["detail"] = f"Action {action_type} not available for role {role}"
            return result

        # Store message if provided — also post to shared memory
        if message and ":" in message:
            to_agent = message.split(":")[0].strip().lower()
            msg_content = ":".join(message.split(":")[1:]).strip()
            self.state.messages.append(Message(
                from_agent=agent_id,
                to_agent=to_agent,
                content=msg_content,
                day=self.state.day,
                turn=self.state.turn,
            ))
            # A2A: all messages also go to shared memory board
            self.state.shared_memory.post(
                author=agent_id, entry_type="message",
                content=f"@{to_agent}: {msg_content}",
                day=self.state.day, turn=self.state.turn,
            )

        # Dispatch to role-specific handler
        handler = getattr(self, f"_handle_{role}", None)
        if handler:
            result = handler(action_type, target, parameters, result)
        else:
            result["detail"] = "Action processed"

        # Auto-post significant results to shared memory
        if result["success"]:
            self._post_to_shared_memory(agent_id, action_type, target, result)

        # Record action
        self.state.recent_actions.append({
            "agent_id": agent_id,
            "action_type": action_type,
            "target": target,
            "day": self.state.day,
            "turn": self.state.turn,
            "success": result["success"],
            "detail": result["detail"],
        })

        return result

    def _post_to_shared_memory(self, agent_id: str, action_type: str, target: str, result: dict):
        """Auto-post significant events to the shared team memory board."""
        sm = self.state.shared_memory
        day, turn = self.state.day, self.state.turn

        # Dev ships features → big update for entire team
        if action_type == "SHIP_RELEASE" and "Shipped" in result.get("detail", ""):
            sm.post(agent_id, "update", f"SHIPPED: {result['detail']}", day, turn)
        elif action_type == "BUILD_FEATURE":
            sm.post(agent_id, "update", f"Building: {result['detail']}", day, turn)

        # Sales pipeline movements → team should know
        elif action_type in ("QUALIFY_LEAD", "RUN_DEMO", "SEND_PROPOSAL"):
            sm.post(agent_id, "update", f"Pipeline: {result['detail']}", day, turn)
        elif action_type == "CLOSE_DEAL":
            sm.post(agent_id, "alert", f"DEAL: {result['detail']}", day, turn)

        # Marketing campaigns → team visibility
        elif action_type == "LAUNCH_CAMPAIGN":
            sm.post(agent_id, "update", f"Campaign: {result['detail']}", day, turn)

        # Content published → Sales and Marketing should know
        elif action_type in ("WRITE_BLOG", "WRITE_CASE_STUDY", "WRITE_SOCIAL_POST"):
            sm.post(agent_id, "update", f"Published: {result['detail']}", day, turn)

        # Feedback collected → Dev should see
        elif action_type == "COLLECT_FEEDBACK":
            sm.post(agent_id, "insight", f"Feedback: {result['detail']}", day, turn)

        # CEO directives → whole team
        elif action_type in ("SET_OKRS", "SEND_DIRECTIVE", "PIVOT"):
            sm.post(agent_id, "alert", f"CEO: {result['detail']}", day, turn)

        # HR updates → team visibility
        elif action_type in ("PLAN_SPRINT", "RESOLVE_BLOCKER", "HIRE_CONTRACTOR"):
            sm.post(agent_id, "update", f"HR: {result['detail']}", day, turn)

        # Customer signals → critical for whole team
        elif action_type in ("EVALUATE_PRODUCT", "REQUEST_FEATURE", "ESCALATE_ISSUE", "REFER_LEAD"):
            sm.post(agent_id, "insight", f"Customer: {result['detail']}", day, turn)

    # ── Dev actions ──────────────────────────────────────────────

    def _handle_dev(self, action_type: str, target: str, parameters: dict, result: dict) -> dict:
        if action_type == "BUILD_FEATURE":
            return self._dev_build_feature(target, parameters, result)
        elif action_type == "FIX_BUG":
            return self._dev_fix_bug(target, result)
        elif action_type == "SHIP_RELEASE":
            return self._dev_ship_release(result)
        elif action_type == "REFACTOR":
            self.state.product_stability = min(1.0, self.state.product_stability + 0.05)
            result["detail"] = f"Refactored codebase. Stability: {self.state.product_stability:.2f}"
        elif action_type == "WRITE_DOCS":
            result["detail"] = "Technical docs updated"
        elif action_type == "REVIEW_PR":
            result["detail"] = "PR reviewed"
        return result

    def _dev_build_feature(self, target: str, parameters: dict, result: dict) -> dict:
        # Check if feature already in progress
        existing = next((f for f in self.state.features if f.name == target and not f.shipped), None)
        if existing:
            existing.turns_remaining -= 1
            if existing.turns_remaining <= 0:
                result["detail"] = f"Feature '{target}' ready to ship"
            else:
                result["detail"] = f"Building '{target}': {existing.turns_remaining} turns remaining"
        else:
            # Start new feature from backlog or custom
            backlog_item = next((b for b in self.state.backlog if b["name"] == target), None)
            desc = backlog_item["description"] if backlog_item else parameters.get("description", target)
            feature = Feature(
                id=str(uuid4())[:8],
                name=target,
                description=desc,
                turns_remaining=self.cfg.feature_build_turns - 1,
            )
            self.state.features.append(feature)
            if backlog_item:
                self.state.backlog.remove(backlog_item)
            result["detail"] = f"Started building '{target}': {feature.turns_remaining} turns remaining"
        return result

    def _dev_fix_bug(self, target: str, result: dict) -> dict:
        bug = next((b for b in self.state.bug_reports if b.get("id") == target or b.get("name") == target), None)
        if bug:
            self.state.bug_reports.remove(bug)
            self.state.product_stability = min(1.0, self.state.product_stability + 0.03)
            result["detail"] = f"Fixed bug: {bug.get('name', target)}"
        else:
            self.state.product_stability = min(1.0, self.state.product_stability + 0.01)
            result["detail"] = f"Fixed issue: {target}"
        return result

    def _dev_ship_release(self, result: dict) -> dict:
        ready = [f for f in self.state.features if not f.shipped and f.turns_remaining <= 0]
        if not ready:
            result["success"] = False
            result["detail"] = "No features ready to ship"
            return result

        if self.state.product_stability < 0.5:
            # Shipping unstable code -- features ship but cause issues
            for f in ready:
                f.shipped = True
                f.stability = 0.3
            self.state.product_stability = max(0.0, self.state.product_stability - 0.2)
            result["detail"] = f"Shipped {len(ready)} features (UNSTABLE! Stability: {self.state.product_stability:.2f})"
        else:
            for f in ready:
                f.shipped = True
                f.stability = self.state.product_stability
            result["detail"] = f"Shipped {len(ready)} features: {[f.name for f in ready]}"
        return result

    # ── Marketing actions ────────────────────────────────────────

    def _handle_marketing(self, action_type: str, target: str, parameters: dict, result: dict) -> dict:
        if action_type == "LAUNCH_CAMPAIGN":
            return self._marketing_launch_campaign(target, parameters, result)
        elif action_type == "RUN_AD":
            return self._marketing_run_ad(target, parameters, result)
        elif action_type == "RESEARCH_MARKET":
            result["detail"] = f"Market research on '{target}' complete"
        elif action_type == "ANALYZE_COMPETITOR":
            result["detail"] = f"Competitor analysis on '{target}' complete"
        elif action_type == "OPTIMIZE_FUNNEL":
            self.state.conversion_rate = min(0.15, self.state.conversion_rate * 1.05)
            result["detail"] = f"Funnel optimized. Conversion: {self.state.conversion_rate:.3f}"
        elif action_type == "A_B_TEST":
            if self.state.budget_remaining >= self.cfg.ab_test_cost:
                self.state.budget_remaining -= self.cfg.ab_test_cost
                improvement = self.state._rng.uniform(0.001, 0.01)
                self.state.conversion_rate = min(0.15, self.state.conversion_rate + improvement)
                result["detail"] = f"A/B test on '{target}': conversion +{improvement:.3f}"
            else:
                result["success"] = False
                result["detail"] = "Insufficient budget for A/B test"
        return result

    def _marketing_launch_campaign(self, target: str, parameters: dict, result: dict) -> dict:
        if self.state.budget_remaining < self.cfg.campaign_cost:
            result["success"] = False
            result["detail"] = "Insufficient budget for campaign"
            return result
        self.state.budget_remaining -= self.cfg.campaign_cost
        campaign = Campaign(
            id=str(uuid4())[:8],
            campaign_type="campaign",
            name=target,
            cost=self.cfg.campaign_cost,
            days_remaining=7,
        )
        self.state.campaigns.append(campaign)
        traffic_boost = self.state._rng.randint(100, 500)
        self.state.website_traffic += traffic_boost
        self.state.brand_awareness = min(100.0, self.state.brand_awareness + 2.0)
        result["detail"] = f"Launched campaign '{target}'. Traffic +{traffic_boost}"
        return result

    def _marketing_run_ad(self, target: str, parameters: dict, result: dict) -> dict:
        if self.state.budget_remaining < self.cfg.ad_cost:
            result["success"] = False
            result["detail"] = "Insufficient budget for ad"
            return result
        self.state.budget_remaining -= self.cfg.ad_cost
        traffic_boost = self.state._rng.randint(50, 200)
        self.state.website_traffic += traffic_boost
        result["detail"] = f"Ad '{target}' running. Traffic +{traffic_boost}"
        return result

    # ── Sales actions ────────────────────────────────────────────

    def _handle_sales(self, action_type: str, target: str, parameters: dict, result: dict) -> dict:
        customer = next((c for c in self.state.customers if c.id == target or c.name == target), None)

        if action_type in ("QUALIFY_LEAD", "RUN_DEMO", "SEND_PROPOSAL", "CLOSE_DEAL", "FOLLOW_UP") and not customer:
            result["success"] = False
            result["detail"] = f"Customer '{target}' not found"
            return result

        if action_type == "QUALIFY_LEAD":
            return self._sales_qualify(customer, result)
        elif action_type == "RUN_DEMO":
            return self._sales_demo(customer, result)
        elif action_type == "SEND_PROPOSAL":
            return self._sales_proposal(customer, result)
        elif action_type == "CLOSE_DEAL":
            return self._sales_close(customer, parameters, result)
        elif action_type == "FOLLOW_UP":
            customer.last_contacted_day = self.state.day
            result["detail"] = f"Followed up with {customer.name}"
        elif action_type == "COLLECT_FEEDBACK":
            fb = {"customer": target, "content": parameters.get("feedback", "general feedback"), "day": self.state.day}
            self.state.feedback.append(fb)
            result["detail"] = f"Collected feedback from {target}"
        return result

    def _sales_qualify(self, customer: Customer, result: dict) -> dict:
        if customer.stage != "lead":
            result["success"] = False
            result["detail"] = f"{customer.name} is in stage '{customer.stage}', not 'lead'"
            return result
        customer.previous_stage = customer.stage
        customer.stage = "qualified"
        customer.last_contacted_day = self.state.day
        self.state._stage_transitions.append(customer)
        result["detail"] = f"Qualified {customer.name} (${customer.budget:,.0f} potential)"
        return result

    def _sales_demo(self, customer: Customer, result: dict) -> dict:
        if customer.stage != "qualified":
            result["success"] = False
            result["detail"] = f"{customer.name} must be 'qualified' for demo, is '{customer.stage}'"
            return result
        # Check if we have any shipped features to demo
        shipped = self.state.shipped_features()
        customer.previous_stage = customer.stage
        customer.stage = "demo"
        customer.last_contacted_day = self.state.day
        self.state._stage_transitions.append(customer)
        if shipped:
            result["detail"] = f"Demo for {customer.name} -- showed {len(shipped)} feature(s): {[f.name for f in shipped]}"
        else:
            result["detail"] = f"Demo for {customer.name} -- no shipped features yet, generic demo"
        return result

    def _sales_proposal(self, customer: Customer, result: dict) -> dict:
        if customer.stage != "demo":
            result["success"] = False
            result["detail"] = f"{customer.name} must be in 'demo' stage for proposal"
            return result
        customer.previous_stage = customer.stage
        customer.stage = "proposal"
        customer.last_contacted_day = self.state.day
        self.state._stage_transitions.append(customer)
        result["detail"] = f"Sent proposal to {customer.name} for ${customer.budget:,.0f}/yr"
        return result

    def _sales_close(self, customer: Customer, parameters: dict, result: dict) -> dict:
        if customer.stage not in ("proposal", "negotiation"):
            result["success"] = False
            result["detail"] = f"{customer.name} must be in 'proposal' or 'negotiation' stage to close"
            return result

        # Determine contract tier from parameters (default: monthly)
        tier_key = parameters.get("contract_tier", "monthly")
        if tier_key not in CONTRACT_TIERS:
            tier_key = "monthly"
        tier = CONTRACT_TIERS[tier_key]

        # Close probability based on shipped features + content touchpoints
        # Longer contracts are harder to close
        base_prob = 0.4 - (tier["months"] - 1) * 0.015
        shipped = self.state.shipped_features()
        if shipped:
            # More shipped features = higher close probability (up to +0.3)
            base_prob += min(0.3, len(shipped) * 0.1)
        if customer.content_touchpoints:
            base_prob += 0.1 * min(len(customer.content_touchpoints), 3)

        if self.state._rng.random() < base_prob:
            customer.previous_stage = customer.stage
            customer.stage = "closed_won"
            customer.contract_tier = tier_key
            customer.last_contacted_day = self.state.day
            self.state._stage_transitions.append(customer)
            contract_revenue = (customer.budget / 12) * tier["months"]
            self.state.revenue += contract_revenue
            self.state.total_revenue += contract_revenue
            result["detail"] = f"CLOSED {customer.name}! {tier['label']} contract: ${contract_revenue:,.0f}"
            result["contract_tier"] = tier_key
        else:
            # Move to negotiation or lose
            if customer.stage == "proposal":
                customer.previous_stage = customer.stage
                customer.stage = "negotiation"
                customer.last_contacted_day = self.state.day
                self.state._stage_transitions.append(customer)
                result["detail"] = f"{customer.name} wants to negotiate"
            else:
                customer.previous_stage = customer.stage
                customer.stage = "closed_lost"
                self.state._stage_transitions.append(customer)
                result["detail"] = f"Lost {customer.name} -- deal fell through"
                result["success"] = False
        return result

    # ── Content actions ──────────────────────────────────────────

    def _handle_content(self, action_type: str, target: str, parameters: dict, result: dict) -> dict:
        if action_type in ("WRITE_BLOG", "WRITE_SOCIAL_POST", "WRITE_CASE_STUDY", "WRITE_EMAIL_SEQUENCE", "WRITE_DOCS"):
            return self._content_write(action_type, target, parameters, result)
        elif action_type == "REVISE_CONTENT":
            return self._content_revise(target, result)
        return result

    def _content_write(self, action_type: str, target: str, parameters: dict, result: dict) -> dict:
        type_map = {
            "WRITE_BLOG": "blog",
            "WRITE_SOCIAL_POST": "social_post",
            "WRITE_CASE_STUDY": "case_study",
            "WRITE_EMAIL_SEQUENCE": "email_sequence",
            "WRITE_DOCS": "docs",
        }
        content_type = type_map[action_type]

        # Check vaporware: if content references an unshipped feature, penalize
        references_feature = parameters.get("feature")
        if references_feature:
            shipped = [f.name.lower() for f in self.state.shipped_features()]
            if references_feature.lower() not in shipped:
                result["success"] = False
                result["detail"] = f"Cannot write about unshipped feature '{references_feature}'"
                return result

        quality = self.state._rng.uniform(0.4, 0.9)
        piece = ContentPiece(
            id=str(uuid4())[:8],
            content_type=content_type,
            title=target,
            topic=parameters.get("topic", target),
            quality=quality,
            published=True,
        )
        self.state.content_pieces.append(piece)

        # Content generates traffic and potentially leads
        traffic_boost = int(quality * self.state._rng.randint(50, 300))
        self.state.website_traffic += traffic_boost
        self.state.brand_awareness = min(100.0, self.state.brand_awareness + quality)

        # Content can attract visitors -> leads
        if self.state._rng.random() < quality * 0.3:
            # Create a new lead attracted by this content
            new_customer = self.state.maybe_spawn_customer()
            if new_customer:
                new_customer.source = content_type
                new_customer.content_touchpoints.append(piece.title)
                # Auto-advance to lead since content attracted them
                new_customer.previous_stage = "visitor"
                new_customer.stage = "lead"
                self.state._stage_transitions.append(new_customer)
                piece.leads_generated += 1
                result["detail"] = f"Published {content_type}: '{target}' (quality: {quality:.2f}). Traffic +{traffic_boost}. Generated lead: {new_customer.name}"
                return result

        result["detail"] = f"Published {content_type}: '{target}' (quality: {quality:.2f}). Traffic +{traffic_boost}"
        return result

    def _content_revise(self, target: str, result: dict) -> dict:
        piece = next((p for p in self.state.content_pieces if p.title == target or p.id == target), None)
        if not piece:
            result["success"] = False
            result["detail"] = f"Content piece '{target}' not found"
            return result
        improvement = self.state._rng.uniform(0.05, 0.2)
        piece.quality = min(1.0, piece.quality + improvement)
        result["detail"] = f"Revised '{piece.title}'. Quality: {piece.quality:.2f} (+{improvement:.2f})"
        return result

    # ── CEO actions ────────────────────────────────────────────

    def _handle_ceo(self, action_type: str, target: str, parameters: dict, result: dict) -> dict:
        if action_type == "SET_OKRS":
            okr = {"objective": target, "key_results": parameters.get("key_results", [target]), "day": self.state.day}
            self.state.okrs.append(okr)
            result["detail"] = f"Set OKR: {target}"
        elif action_type == "ALLOCATE_BUDGET":
            amount = parameters.get("amount", 0)
            dept = target.lower()
            result["detail"] = f"Budget directive: allocate ${amount:,.0f} focus to {dept}"
        elif action_type == "REVIEW_STRATEGY":
            result["detail"] = f"Strategy review on '{target}': assessed KPIs and team alignment"
        elif action_type == "PIVOT":
            result["detail"] = f"Pivot decision: {target}. Team notified to adjust priorities."
            self.state.shared_memory.post("ceo", "alert", f"PIVOT: {target}", self.state.day, self.state.turn)
        elif action_type == "SEND_DIRECTIVE":
            result["detail"] = f"Directive sent: {target}"
        elif action_type == "APPROVE_INITIATIVE":
            result["detail"] = f"Approved initiative: {target}"
        return result

    # ── HR / Planning actions ─────────────────────────────────

    def _handle_hr(self, action_type: str, target: str, parameters: dict, result: dict) -> dict:
        if action_type == "PLAN_SPRINT":
            result["detail"] = f"Sprint planned: {target}. Dev priorities updated."
            self.state.team_velocity = min(2.0, self.state.team_velocity + 0.05)
        elif action_type == "TRACK_OKRS":
            completed = len([o for o in self.state.okrs if o.get("completed")])
            total = len(self.state.okrs)
            result["detail"] = f"OKR tracking: {completed}/{total} completed"
        elif action_type == "RESOLVE_BLOCKER":
            blocker = next((b for b in self.state.blockers if b.get("name") == target), None)
            if blocker:
                self.state.blockers.remove(blocker)
                self.state.team_velocity = min(2.0, self.state.team_velocity + 0.1)
                result["detail"] = f"Resolved blocker: {target}. Velocity +10%"
            else:
                result["detail"] = f"Addressed potential blocker: {target}"
                self.state.team_velocity = min(2.0, self.state.team_velocity + 0.03)
        elif action_type == "HIRE_CONTRACTOR":
            if self.state.budget_remaining >= self.cfg.contractor_cost:
                self.state.budget_remaining -= self.cfg.contractor_cost
                self.state.contractors += 1
                self.state.team_velocity = min(2.0, self.state.team_velocity + 0.15)
                result["detail"] = f"Hired contractor for '{target}'. Velocity boosted. Cost: ${self.cfg.contractor_cost:,.0f}"
            else:
                result["success"] = False
                result["detail"] = "Insufficient budget to hire contractor"
        elif action_type == "PERFORMANCE_REVIEW":
            self.state.team_velocity = min(2.0, self.state.team_velocity + 0.02)
            result["detail"] = f"Performance review: {target}. Team morale improved."
        elif action_type == "TEAM_SYNC":
            self.state.team_velocity = min(2.0, self.state.team_velocity + 0.05)
            result["detail"] = f"Team sync on '{target}'. Alignment improved."
        return result

    # ── Customer actions ──────────────────────────────────────

    def _handle_customer(self, action_type: str, target: str, parameters: dict, result: dict) -> dict:
        if action_type == "EVALUATE_PRODUCT":
            shipped = len(self.state.shipped_features())
            stability = self.state.product_stability
            score = min(100, shipped * 15 + stability * 30 + self.state.brand_awareness * 0.3)
            self.state.nps_score = round(score, 1)
            self.state.customer_satisfaction = min(1.0, score / 100)
            result["detail"] = f"Product evaluation: NPS={self.state.nps_score:.0f}, satisfaction={self.state.customer_satisfaction:.2f} ({shipped} features, {stability:.0%} stable)"
        elif action_type == "REQUEST_FEATURE":
            self.state.backlog.append({
                "id": str(uuid4())[:8], "name": target,
                "description": parameters.get("description", target),
                "priority": "high", "requested_by": "customer",
            })
            result["detail"] = f"Customer requested feature: {target}"
        elif action_type == "GIVE_FEEDBACK":
            fb = {"customer": "customer_agent", "content": parameters.get("feedback", target), "day": self.state.day}
            self.state.feedback.append(fb)
            result["detail"] = f"Customer feedback: {parameters.get('feedback', target)[:60]}"
        elif action_type == "REFER_LEAD":
            new_customer = self.state.maybe_spawn_customer()
            if new_customer:
                new_customer.source = "referral"
                new_customer.previous_stage = "visitor"
                new_customer.stage = "lead"
                self.state._stage_transitions.append(new_customer)
                result["detail"] = f"Customer referral! New lead: {new_customer.name}"
            else:
                result["detail"] = "Referral noted, lead will arrive soon"
        elif action_type == "ESCALATE_ISSUE":
            self.state.bug_reports.append({"id": str(uuid4())[:8], "name": target, "severity": "high", "reported_by": "customer"})
            self.state.customer_satisfaction = max(0.0, self.state.customer_satisfaction - 0.1)
            self.state.nps_score = max(0, self.state.nps_score - 5)
            result["detail"] = f"Customer escalated issue: {target}. Satisfaction dropped."
        elif action_type == "RENEW_CONTRACT":
            won = [c for c in self.state.customers if c.stage == "closed_won"]
            if won:
                customer = won[0]
                renewal_rev = customer.budget * 0.1  # 10% renewal bonus
                self.state.revenue += renewal_rev
                self.state.total_revenue += renewal_rev
                self.state.customer_satisfaction = min(1.0, self.state.customer_satisfaction + 0.1)
                result["detail"] = f"Contract renewed for {customer.name}! +${renewal_rev:,.0f} revenue"
            else:
                result["detail"] = "No active contracts to renew"
        return result

    def advance(self):
        """Advance the simulation clock."""
        self.state.advance_time()
