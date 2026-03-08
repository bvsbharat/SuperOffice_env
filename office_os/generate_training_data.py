#!/usr/bin/env python3
"""Generate expert training data using rule-based optimal policies.

No LLM calls needed — runs the simulation with hand-crafted expert policies
that make the optimal decision each turn. Outputs JSONL trajectories in the
same format as the TrajectoryCollector for direct use with GRPO training.

v2 improvements over v1:
  - Rich, KPI-aware reasoning that references actual numbers
  - Context-specific messages referencing real customer names & features
  - Negative examples (mediocre actions with low reward) for GRPO variance
  - More episodes (50+) and all 5 scenarios for diverse training data
  - Reward quality multiplier based on reasoning depth

Usage:
    python generate_training_data.py --episodes 50 --days 30
    python generate_training_data.py --episodes 100 --scenarios baseline series_a viral
    python generate_training_data.py --episodes 50 --include-negative --neg-ratio 0.2
"""

import argparse
import json
import logging
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)

from agents.llm_agent import LLMAgent
from agents.prompts import ROLE_PROMPTS
from market.config import AGENT_ROLES, ROLE_ACTIONS, TURNS_PER_DAY, EPISODE_DAYS
from server.office_os_environment import OfficeOsEnvironment
from models import OfficeOsAction


# ── Helper: extract context from observations ─────────────────────────────

def _customer_names(obs: dict) -> list[str]:
    """Extract customer names from pipeline."""
    pipeline = obs.get("role_data", {}).get("pipeline", [])
    if not pipeline:
        pipeline = obs.get("role_data", {}).get("team_status", {}).get("sales", {}).get("pipeline", [])
    return [c["name"] for c in pipeline if "name" in c]


def _shipped_features(obs: dict) -> list[str]:
    """Extract shipped feature names."""
    rd = obs.get("role_data", {})
    shipped = rd.get("team_status", {}).get("dev", {}).get("shipped", [])
    if not shipped:
        shipped = rd.get("shipped", [])
    return [f if isinstance(f, str) else f.get("name", "") for f in shipped]


def _building_features(obs: dict) -> list[dict]:
    """Extract features in progress."""
    rd = obs.get("role_data", {})
    return rd.get("features_in_progress", rd.get("team_status", {}).get("dev", {}).get("building", []))


def _pipeline_closest(obs: dict) -> dict | None:
    """Get the customer closest to closing."""
    pipeline = obs.get("role_data", {}).get("pipeline", [])
    priority = {"proposal": 0, "negotiation": 1, "demo": 2, "qualified": 3, "lead": 4}
    active = [c for c in pipeline if c.get("stage") in priority]
    if not active:
        return None
    active.sort(key=lambda c: priority.get(c["stage"], 99))
    return active[0]


# ── Expert policies per role (v2 — rich reasoning) ───────────────────────

def expert_ceo(obs: dict, turn: int) -> dict:
    """CEO: Strategic decisions with KPI-aware reasoning."""
    kpis = obs.get("kpis", {})
    day = obs.get("day", 1)
    rev = kpis.get("total_revenue", 0)
    pipeline = kpis.get("pipeline_value", 0)
    features = kpis.get("features_shipped", 0)
    budget = kpis.get("budget_remaining", 0)
    traffic = kpis.get("website_traffic", 0)
    nps = kpis.get("nps_score", 50)
    velocity = kpis.get("team_velocity", 1.0)
    customers = _customer_names(obs)
    shipped = _shipped_features(obs)

    # Day 1-2: always set OKRs
    if day <= 2:
        kr_list = []
        if pipeline < 50000:
            kr_list.append("Build pipeline to $100K+ value")
        kr_list.append(f"Ship {max(2, 4 - features)} features this quarter")
        kr_list.append("Close 3 customer deals")
        if nps < 40:
            kr_list.append("Raise NPS above 50")

        cust_str = f" Key prospects: {', '.join(customers[:3])}." if customers else ""
        return {
            "action_type": "SET_OKRS",
            "target": "Q1_Revenue_Growth",
            "parameters": {"key_results": kr_list[:3]},
            "reasoning": f"Day {day}: Setting revenue-focused OKRs. Current pipeline is ${pipeline:,.0f} with {features} features shipped.{cust_str} Team needs clear targets to align around deal closure.",
            "message": f"sales: Top priority is closing deals this quarter.{' Focus on ' + customers[0] + ' first.' if customers else ''} dev: ship features ASAP to support demos.",
        }

    # Budget crisis
    if budget < 5000:
        return {
            "action_type": "SEND_DIRECTIVE",
            "target": "Budget conservation — freeze paid campaigns",
            "parameters": {},
            "reasoning": f"Budget is critically low at ${budget:,.0f}. Must freeze all paid activities. Pipeline is ${pipeline:,.0f}, so focus on converting existing leads. Revenue is ${rev:,.0f}.",
            "message": f"marketing: STOP all paid campaigns, budget is ${budget:,.0f}. Focus on organic only. sales: close existing pipeline — every deal counts.",
        }

    # No features shipped after day 5
    if features == 0 and day > 5:
        building = _building_features(obs)
        build_str = f" Dev is building {building[0]['name']}." if building else " Nothing in progress — critical gap."
        return {
            "action_type": "SEND_DIRECTIVE",
            "target": "Accelerate feature delivery",
            "parameters": {},
            "reasoning": f"Day {day} with 0 features shipped — sales has nothing to demo.{build_str} Pipeline is ${pipeline:,.0f} but we can't convert without product.",
            "message": f"dev: features are blocking revenue, ship ASAP. hr: clear all dev blockers immediately.{' sales: ' + customers[0] + ' is waiting.' if customers else ''}",
        }

    # Empty pipeline
    if pipeline == 0 and day > 3:
        return {
            "action_type": "SEND_DIRECTIVE",
            "target": "Generate pipeline urgently",
            "parameters": {},
            "reasoning": f"Day {day} with $0 pipeline — no revenue path. Traffic is {traffic:,.0f}, conversion is {kpis.get('conversion_rate', 0):.1%}. Need immediate lead generation.",
            "message": "marketing: launch campaigns NOW, pipeline is empty. sales: qualify any inbound immediately. content: write content to drive traffic.",
        }

    # No revenue after day 10
    if rev == 0 and day > 10:
        closest = _pipeline_closest(obs)
        closest_str = f" {closest['name']} is at {closest['stage']} stage." if closest else ""
        return {
            "action_type": "REVIEW_STRATEGY",
            "target": "Revenue pipeline review",
            "parameters": {},
            "reasoning": f"Day {day} with $0 revenue is a red flag. Pipeline is ${pipeline:,.0f}, {features} features shipped, NPS is {nps:.0f}.{closest_str} Need to identify and remove blockers to deal closure.",
            "message": f"sales: what's blocking deal closure? Need status on every prospect.{' Focus on ' + closest['name'] + '.' if closest else ''} dev: are customer-requested features shipped?",
        }

    # Low NPS — customer satisfaction issue
    if nps < 35 and day > 5:
        return {
            "action_type": "REVIEW_STRATEGY",
            "target": "Customer satisfaction recovery",
            "parameters": {},
            "reasoning": f"NPS dropped to {nps:.0f} — risk of churn. Product stability is {kpis.get('product_stability', 0):.0%}. Need dev to fix bugs and sales to manage customer expectations.",
            "message": "dev: customer satisfaction is low, fix bugs before new features. sales: reach out to unhappy customers. hr: prioritize stability sprint.",
        }

    # Low velocity
    if velocity < 0.8:
        return {
            "action_type": "SEND_DIRECTIVE",
            "target": "Boost team velocity",
            "parameters": {},
            "reasoning": f"Team velocity is {velocity:.1f}x — below target. This slows feature delivery and blocks revenue. {kpis.get('blockers', 0)} active blockers. Need HR to intervene.",
            "message": f"hr: velocity is {velocity:.1f}x, resolve blockers and consider hiring. dev: focus on highest-impact work only.",
        }

    # Allocate budget to marketing if pipeline thin
    if pipeline < 30000 and budget > 20000 and day > 3:
        amount = min(10000, budget * 0.2)
        return {
            "action_type": "ALLOCATE_BUDGET",
            "target": "marketing",
            "parameters": {"amount": amount},
            "reasoning": f"Pipeline is thin at ${pipeline:,.0f}. Allocating ${amount:,.0f} to marketing for lead generation. Budget remaining: ${budget:,.0f}. Need to fill the funnel.",
            "message": f"marketing: allocated ${amount:,.0f} for campaigns. Generate leads fast. sales: be ready to qualify incoming leads.",
        }

    # Periodic strategy with context
    choices = []
    if features > 0 and rev > 0:
        choices.append({
            "action_type": "SEND_DIRECTIVE",
            "target": "Scale what's working",
            "parameters": {},
            "reasoning": f"Momentum is good: ${rev:,.0f} revenue, {features} features, ${pipeline:,.0f} pipeline. Double down on what's working — more campaigns, more demos, close faster.",
            "message": f"sales: pipeline is ${pipeline:,.0f}, push every deal forward. marketing: amplify our wins — {shipped[0] if shipped else 'features'} is resonating." if shipped else "sales: keep pushing. marketing: amplify wins.",
        })
    choices.append({
        "action_type": "REVIEW_STRATEGY",
        "target": f"Day {day} performance review",
        "parameters": {},
        "reasoning": f"Day {day} check: Rev=${rev:,.0f}, Pipeline=${pipeline:,.0f}, Features={features}, NPS={nps:.0f}, Traffic={traffic:,.0f}. {'On track.' if rev > 0 else 'Need to accelerate.'}",
        "message": f"team: Day {day} review — rev=${rev:,.0f}, pipeline=${pipeline:,.0f}. {'Keep pushing.' if rev > 0 else 'We need to move faster.'}",
    })
    choices.append({
        "action_type": "SEND_DIRECTIVE",
        "target": "Cross-team alignment",
        "parameters": {},
        "reasoning": f"Ensuring team alignment. {features} features shipped, {len(customers)} customers in pipeline. Need coordinated push.",
        "message": f"dev: what's next after {shipped[-1] if shipped else 'current build'}? sales: which prospect is closest to closing? content: amplify our shipped features.",
    })

    return random.choice(choices)


def expert_dev(obs: dict, turn: int) -> dict:
    """Dev: Build → Ship → Repeat with contextual reasoning."""
    role_data = obs.get("role_data", {})
    kpis = obs.get("kpis", {})
    in_progress = role_data.get("features_in_progress", [])
    backlog = role_data.get("backlog", [])
    bugs = role_data.get("bug_reports", [])
    customers = _customer_names(obs)
    shipped = _shipped_features(obs)
    stability = kpis.get("product_stability", 1.0)

    # Ship if ready
    ready = [f for f in in_progress if f.get("turns_remaining", 99) <= 0]
    if ready:
        feat = ready[0]["name"]
        cust_str = f" {customers[0]} needs this for their demo." if customers else ""
        return {
            "action_type": "SHIP_RELEASE",
            "target": feat,
            "parameters": {},
            "reasoning": f"'{feat}' is complete and ready to ship. This will be feature #{len(shipped) + 1}.{cust_str} Shipping immediately to unblock sales pipeline.",
            "message": f"sales: shipped {feat}! Ready for customer demos.{' ' + customers[0] + ' can see it now.' if customers else ''} content: write a case study about {feat}.",
        }

    # Continue building
    if in_progress:
        building = in_progress[0]
        name = building["name"]
        remaining = building.get("turns_remaining", "?")
        pipeline_str = f" Sales pipeline has {len(customers)} prospects waiting." if customers else ""
        return {
            "action_type": "BUILD_FEATURE",
            "target": name,
            "parameters": {},
            "reasoning": f"Continuing '{name}' — {remaining} turns remaining.{pipeline_str} Need to finish this before starting anything new.",
            "message": f"sales: still building {name}, {remaining} turns left.{' ' + customers[0] + ' will be first to get it.' if customers else ''} Stay tuned.",
        }

    # Fix critical bugs (especially if stability is low)
    critical = [b for b in bugs if b.get("severity") in ("critical", "high")]
    if critical or (bugs and stability < 0.7):
        bug = (critical or bugs)[0]
        bug_name = bug.get("name", bug.get("id", "unknown"))
        return {
            "action_type": "FIX_BUG",
            "target": bug_name,
            "parameters": {},
            "reasoning": f"Fixing {'critical' if bug.get('severity') == 'critical' else 'high-priority'} bug '{bug_name}'. Product stability is {stability:.0%} — customers will churn if we don't fix this. {len(bugs)} total bugs in queue.",
            "message": f"sales: fixing bug '{bug_name}' — stability is {stability:.0%}. customer: aware of the issue, fix incoming.{' ' + customers[0] + ': hang tight.' if customers else ''}",
        }

    # Start new feature from backlog
    if backlog:
        item = backlog[0]
        name = item["name"]
        priority = item.get("priority", "medium")
        # Connect feature to customer needs
        pain_match = ""
        for c in (obs.get("role_data", {}).get("team_status", {}).get("sales", {}).get("pipeline", [])):
            if any(kw.lower() in c.get("pain_point", "").lower() for kw in name.lower().split()):
                pain_match = f" {c['name']} specifically needs this (pain: {c['pain_point']})."
                break
        return {
            "action_type": "BUILD_FEATURE",
            "target": name,
            "parameters": {},
            "reasoning": f"Starting '{name}' ({priority} priority) from backlog. {len(shipped)} features shipped so far.{pain_match} This will take ~3 turns.",
            "message": f"sales: starting build on {name} ({priority}). Will take ~3 turns.{' This addresses ' + customers[0] + ' needs.' if customers and pain_match else ''} hr: keep my sprint focused.",
        }

    # Nothing to do — refactor
    return {
        "action_type": "REFACTOR",
        "target": "codebase",
        "parameters": {},
        "reasoning": f"No pending features or bugs. Stability is {stability:.0%}. Refactoring to improve reliability — each refactor adds +5% stability. {len(shipped)} features shipped.",
        "message": f"sales: no pending features, improving codebase stability ({stability:.0%} → {min(1.0, stability + 0.05):.0%}). Will pick up next backlog item when available.",
    }


def expert_marketing(obs: dict, turn: int) -> dict:
    """Marketing: Data-driven campaign decisions."""
    kpis = obs.get("kpis", {})
    budget = kpis.get("budget_remaining", 0)
    pipeline = kpis.get("pipeline_value", 0)
    traffic = kpis.get("website_traffic", 0)
    conversion = kpis.get("conversion_rate", 0)
    awareness = kpis.get("brand_awareness", 0)
    day = obs.get("day", 1)
    customers = _customer_names(obs)
    shipped = _shipped_features(obs)
    content = obs.get("role_data", {}).get("team_status", {}).get("content", {}).get("published", [])

    # Low budget — free actions only
    if budget < 3000:
        if conversion < 0.04:
            return {
                "action_type": "OPTIMIZE_FUNNEL",
                "target": "conversion rate optimization",
                "parameters": {},
                "reasoning": f"Budget is low (${budget:,.0f}). Conversion is {conversion:.1%} — below 4% target. Free funnel optimization can boost conversion without spend. Traffic is {traffic:,.0f}.",
                "message": f"sales: optimizing funnel to convert more of our {traffic:,.0f} visitors. ceo: budget tight, focusing on free growth levers.",
            }
        return {
            "action_type": "RESEARCH_MARKET",
            "target": "competitive landscape analysis",
            "parameters": {},
            "reasoning": f"Budget constrained at ${budget:,.0f}. Conversion is healthy at {conversion:.1%}. Doing free market research to find new positioning angles. Pipeline is ${pipeline:,.0f}.",
            "message": "ceo: researching market while conserving budget. sales: will share insights on what messaging resonates.",
        }

    # Pipeline thin or early days — launch campaign
    if pipeline < 20000 or day <= 3:
        # Pick topic based on context
        if shipped:
            topic = f"{shipped[-1]} launch campaign"
            reasoning = f"Pipeline is thin (${pipeline:,.0f}). Launching campaign around our latest feature '{shipped[-1]}' to generate qualified leads. Budget: ${budget:,.0f}."
        elif customers:
            industries = set()
            for c in obs.get("role_data", {}).get("team_status", {}).get("sales", {}).get("pipeline", []):
                if "industry" in c:
                    industries.add(c["industry"])
            industry = list(industries)[0] if industries else "SaaS"
            topic = f"{industry.title()} professionals campaign"
            reasoning = f"Pipeline needs leads — only ${pipeline:,.0f}. Targeting {industry} segment where we have {len(customers)} prospects. Traffic is {traffic:,.0f}, need to scale."
        else:
            topics = ["SaaS professionals", "Enterprise security", "Digital transformation", "B2B productivity"]
            topic = random.choice(topics)
            reasoning = f"Day {day}: Pipeline is ${pipeline:,.0f}. Launching broad campaign to build initial pipeline. Budget: ${budget:,.0f}, traffic: {traffic:,.0f}."

        return {
            "action_type": "LAUNCH_CAMPAIGN",
            "target": topic,
            "parameters": {},
            "reasoning": reasoning,
            "message": f"sales: launched campaign '{topic}', expect new leads in 1-2 days.{' content: need content about ' + shipped[-1] + ' to support campaign.' if shipped else ''}",
        }

    # Low conversion — A/B test
    if conversion < 0.03:
        return {
            "action_type": "A_B_TEST",
            "target": "landing page headline and CTA optimization",
            "parameters": {},
            "reasoning": f"Conversion rate is {conversion:.1%} — well below 3% target. Traffic is {traffic:,.0f} so even small conversion gains mean significant leads. A/B test gives permanent improvement.",
            "message": f"sales: running A/B test to improve conversion from {conversion:.1%}. Should see better lead quality soon.",
        }

    # Amplify content if available
    if content and random.random() < 0.4:
        piece = content[-1] if isinstance(content[-1], str) else content[-1].get("title", "content")
        return {
            "action_type": "RUN_AD",
            "target": f"Promote: {piece}",
            "parameters": {},
            "reasoning": f"Amplifying published content '{piece}' with paid promotion. Pipeline is ${pipeline:,.0f}, traffic is {traffic:,.0f}. Content-backed ads convert better.",
            "message": f"content: promoting your '{piece}' with paid ads. sales: expect leads interested in this topic.",
        }

    # Run targeted ads
    segments = ["enterprise decision makers", "startup founders", "SMB operations leads", "IT security buyers"]
    segment = random.choice(segments)
    return {
        "action_type": "RUN_AD",
        "target": segment,
        "parameters": {},
        "reasoning": f"Running targeted ads to {segment}. Pipeline is ${pipeline:,.0f}, awareness is {awareness:.0f}. Maintaining lead flow while managing ${budget:,.0f} budget.",
        "message": f"sales: running ads targeting {segment}. Qualify incoming leads quickly — conversion is {conversion:.1%}.",
    }


def expert_sales(obs: dict, turn: int) -> dict:
    """Sales: Advance pipeline with customer-specific reasoning."""
    role_data = obs.get("role_data", {})
    kpis = obs.get("kpis", {})
    pipeline = role_data.get("pipeline", [])
    shipped = _shipped_features(obs)
    rev = kpis.get("total_revenue", 0)

    stage_to_action = {
        "lead": "QUALIFY_LEAD",
        "qualified": "RUN_DEMO",
        "demo": "SEND_PROPOSAL",
        "proposal": "CLOSE_DEAL",
        "negotiation": "CLOSE_DEAL",
    }

    stage_priority = {"proposal": 0, "negotiation": 1, "demo": 2, "qualified": 3, "lead": 4}

    active = [c for c in pipeline if c.get("stage") in stage_to_action]

    if not active:
        if turn % 3 == 0:
            return {
                "action_type": "UPDATE_SHEET",
                "target": "pipeline sync",
                "parameters": {},
                "reasoning": f"Pipeline is empty. Syncing sheet to track that we need leads. Revenue so far: ${rev:,.0f}. Waiting for marketing campaigns to fill pipeline.",
                "message": "marketing: pipeline is EMPTY — need campaigns urgently. ceo: $0 pipeline, revenue at risk.",
            }
        return {
            "action_type": "COLLECT_FEEDBACK",
            "target": "market intelligence",
            "parameters": {"feedback": f"Pipeline empty after ${rev:,.0f} revenue. Need to understand what messaging attracts prospects and what features they need."},
            "reasoning": f"No active prospects. Collecting market feedback to understand demand. Revenue is ${rev:,.0f}. Need marketing to generate inbound.",
            "message": "marketing: need more leads, pipeline is dry. dev: what features can we highlight to attract enterprise buyers?",
        }

    # Sort by closest to closing
    active.sort(key=lambda c: stage_priority.get(c["stage"], 99))

    # Check for stale leads first
    stale = [c for c in active if c.get("days_since_contact", 0) > 3]
    if stale:
        c = stale[0]
        days_stale = c.get("days_since_contact", 0)
        return {
            "action_type": "FOLLOW_UP",
            "target": c["name"],
            "parameters": {},
            "reasoning": f"Following up with {c['name']} ({c['stage']} stage, ${c.get('budget', 0):,.0f}) — {days_stale} days since last contact. Risk of losing this lead if we don't re-engage. Their pain point: {c.get('pain_point', 'unknown')}.",
            "message": f"dev: {c['name']} has gone quiet ({days_stale} days), they need {c.get('pain_point', 'our attention')}. content: send them our latest case study.",
        }

    # Advance the highest-priority customer
    c = active[0]
    action = stage_to_action[c["stage"]]
    name = c["name"]
    budget = c.get("budget", 0)
    pain = c.get("pain_point", "")
    stage = c["stage"]

    params = {}
    reasoning_parts = [f"Advancing {name} from '{stage}' stage (${budget:,.0f} deal)."]

    if pain:
        reasoning_parts.append(f"Their pain point: {pain}.")

    if action == "QUALIFY_LEAD":
        reasoning_parts.append(f"Need to assess fit and urgency before investing demo time.")
        msg = f"dev: qualifying {name} — they need {pain or 'our solution'}. marketing: any intel on this prospect?"

    elif action == "RUN_DEMO":
        feature_str = f" Demoing shipped features: {', '.join(shipped[:2])}." if shipped else " Need features to demo — flagging to dev."
        reasoning_parts.append(f"Running demo to show product value.{feature_str}")
        msg = f"dev: demoing to {name} today.{' Featuring ' + shipped[0] + '.' if shipped else ' Need features!'} content: send {name} our case studies."

    elif action == "SEND_PROPOSAL":
        reasoning_parts.append(f"Demo went well, sending proposal to lock in the deal.")
        msg = f"ceo: sending proposal to {name} (${budget:,.0f}). dev: make sure {pain or 'product'} is solid for them."

    elif action == "CLOSE_DEAL":
        size = c.get("company_size", "smb")
        tier = {"startup": "monthly", "smb": "6_month", "enterprise": "annual"}.get(size, "monthly")
        params = {"contract_tier": tier}
        reasoning_parts.append(f"Ready to close! Proposing {tier} contract for this {size} company. Revenue impact: ${budget:,.0f}.")
        msg = f"ceo: closing {name} for ${budget:,.0f} ({tier} contract)! dev: ensure {pain or 'product'} is production-ready. team: revenue incoming!"
    else:
        msg = f"dev: working on {name}. Need support."

    # Periodically update sheet
    update_sheet_reminder = ""
    if turn % 5 == 0:
        reasoning_parts.append("Also scheduling sheet sync.")
        update_sheet_reminder = ""

    return {
        "action_type": action,
        "target": name,
        "parameters": params,
        "reasoning": " ".join(reasoning_parts),
        "message": msg,
    }


def expert_content(obs: dict, turn: int) -> dict:
    """Content: Strategic content creation tied to business goals."""
    role_data = obs.get("role_data", {})
    kpis = obs.get("kpis", {})
    team_status = role_data.get("team_status", {})
    shipped = team_status.get("dev", {}).get("shipped", [])
    shipped_names = [f if isinstance(f, str) else f.get("name", "") for f in shipped]
    published = role_data.get("published", [])
    customers = _customer_names(obs)
    traffic = kpis.get("website_traffic", 0)
    pipeline = kpis.get("pipeline_value", 0)

    content_in_progress = role_data.get("content_in_progress", [])
    if content_in_progress:
        piece = content_in_progress[0]
        ptype = piece.get("content_type", "WRITE_BLOG").upper().replace(" ", "_")
        title = piece.get("title", piece.get("topic", "article"))
        remaining = piece.get("turns_remaining", "?")
        return {
            "action_type": ptype if ptype in ROLE_ACTIONS.get("content", []) else "WRITE_BLOG",
            "target": title,
            "parameters": {"topic": piece.get("topic", "product")},
            "reasoning": f"Continuing '{title}' — {remaining} turns left. {len(published)} pieces published so far. Finishing this before starting new work.",
            "message": f"marketing: '{title}' in progress, {remaining} turns left. Will share for promotion when done.",
        }

    # Case study if features shipped — highest value content
    if shipped_names:
        # Pick least-covered feature
        covered = set()
        for p in published:
            name = p if isinstance(p, str) else p.get("title", "")
            for feat in shipped_names:
                if feat.lower() in name.lower():
                    covered.add(feat)
        uncovered = [f for f in shipped_names if f not in covered]
        feature = uncovered[0] if uncovered else shipped_names[0]

        cust_str = f" {customers[0]} is evaluating this feature." if customers else ""
        return {
            "action_type": "WRITE_CASE_STUDY",
            "target": f"{feature} success story",
            "parameters": {"feature": feature},
            "reasoning": f"Writing case study about '{feature}' — shipped feature that customers care about.{cust_str} Case studies are the highest-converting content for Sales. {len(published)} pieces published so far.",
            "message": f"sales: writing case study on {feature} — use it in proposals and demos.{' Perfect for ' + customers[0] + '.' if customers else ''} marketing: will share for campaign use.",
        }

    # No shipped features — write blogs to drive traffic
    if pipeline < 20000:
        # Traffic-focused content
        topics = [
            ("Why SaaS Companies Need SSO in 2024", "enterprise security"),
            ("The Hidden Cost of Poor Onboarding", "user onboarding"),
            ("Compliance Automation: A CTO's Guide", "compliance"),
            ("5 API Integration Patterns Every Dev Should Know", "API integration"),
            ("How to Scale Your B2B Sales Pipeline", "sales pipeline"),
        ]
    else:
        # Thought leadership when pipeline is healthy
        topics = [
            ("The Future of Enterprise Collaboration", "enterprise productivity"),
            ("Building Trust: Security Certifications That Matter", "security trust"),
            ("From Startup to Scale-up: Lessons in Product-Led Growth", "growth strategy"),
            ("Customer Success Metrics That Actually Predict Retention", "customer success"),
        ]

    title, topic = random.choice(topics)
    return {
        "action_type": "WRITE_BLOG",
        "target": title,
        "parameters": {"topic": topic},
        "reasoning": f"No shipped features for case study yet. Writing blog '{title}' to drive traffic (currently {traffic:,.0f}). Pipeline is ${pipeline:,.0f} — content drives inbound leads. {len(published)} pieces published.",
        "message": f"marketing: writing blog '{title}', please amplify when published. sales: this targets {topic} — useful for nurturing leads.",
    }


def expert_hr(obs: dict, turn: int) -> dict:
    """HR: Sprint planning and blocker resolution with context."""
    role_data = obs.get("role_data", {})
    kpis = obs.get("kpis", {})
    blockers_count = kpis.get("blockers", 0)
    velocity = kpis.get("team_velocity", 1.0)
    budget = kpis.get("budget_remaining", 0)
    day = obs.get("day", 1)
    features = kpis.get("features_shipped", 0)
    rev = kpis.get("total_revenue", 0)
    customers = _customer_names(obs)
    building = _building_features(obs)

    # Resolve blockers first — always highest priority
    if blockers_count > 0:
        blocker_list = role_data.get("blockers", [])
        blocker_desc = blocker_list[0].get("description", "team blocker") if blocker_list else "active blocker"
        return {
            "action_type": "RESOLVE_BLOCKER",
            "target": blocker_desc,
            "parameters": {},
            "reasoning": f"Resolving blocker: '{blocker_desc}'. {blockers_count} total blockers dragging velocity to {velocity:.1f}x. Dev has {len(building)} features in progress — blockers delay shipping.",
            "message": f"dev: clearing blocker '{blocker_desc}' to unblock your work.{' This delays ' + building[0]['name'] + '.' if building else ''} ceo: working on velocity improvement.",
        }

    # Low velocity — hire if budget allows
    if velocity < 0.8:
        if budget > 5000:
            return {
                "action_type": "HIRE_CONTRACTOR",
                "target": "senior developer",
                "parameters": {},
                "reasoning": f"Team velocity is {velocity:.1f}x — critically low. Hiring contractor (${1000:,.0f}) to boost output. Budget is ${budget:,.0f}. {features} features shipped, need to accelerate.",
                "message": f"dev: hiring contractor to help with backlog. ceo: investing $1,000 in velocity — currently {velocity:.1f}x.{' Need to ship for ' + customers[0] + '.' if customers else ''}",
            }
        return {
            "action_type": "PLAN_SPRINT",
            "target": "efficiency improvement",
            "parameters": {},
            "reasoning": f"Velocity is low ({velocity:.1f}x) but budget tight (${budget:,.0f}). Planning efficiency sprint to maximize output without hiring.",
            "message": f"dev: planning efficiency sprint. Focus on highest-impact work only. ceo: velocity is {velocity:.1f}x, optimizing without spend.",
        }

    # Track OKRs periodically
    if day % 3 == 1:
        return {
            "action_type": "TRACK_OKRS",
            "target": "quarterly objectives review",
            "parameters": {},
            "reasoning": f"Day {day} OKR check: Revenue ${rev:,.0f}, {features} features shipped, velocity {velocity:.1f}x, {len(customers)} prospects in pipeline. Tracking to keep team aligned.",
            "message": f"ceo: OKR update — rev=${rev:,.0f}, features={features}, velocity={velocity:.1f}x.{' Pipeline has ' + str(len(customers)) + ' prospects.' if customers else ''} {'On track.' if rev > 0 else 'Need to accelerate.'}",
        }

    # Team sync after major events
    if features > 0 and day % 4 == 0:
        return {
            "action_type": "TEAM_SYNC",
            "target": "cross-functional alignment",
            "parameters": {},
            "reasoning": f"Running team sync with {features} features shipped and {len(customers)} prospects. Ensuring dev→sales→content pipeline is flowing. Velocity is {velocity:.1f}x.",
            "message": "team: sync meeting — let's align on priorities. dev: what's shipping next? sales: which deals are closest? content: what can we amplify?",
        }

    # Plan sprint around context
    if building:
        focus = f"{building[0]['name']} delivery"
    elif customers:
        focus = f"deal closure support for {customers[0]}"
    else:
        focus = random.choice(["feature development", "deal closure", "content pipeline", "stability improvement"])

    return {
        "action_type": "PLAN_SPRINT",
        "target": focus,
        "parameters": {},
        "reasoning": f"Planning sprint focused on '{focus}'. Velocity is {velocity:.1f}x, {features} features shipped, {blockers_count} blockers. Keeping team momentum high.",
        "message": f"dev: sprint planned around {focus}.{' Priority: get ' + building[0]['name'] + ' shipped.' if building else ''} team: let's execute.",
    }


def expert_customer(obs: dict, turn: int) -> dict:
    """Customer: Realistic B2B customer behavior."""
    kpis = obs.get("kpis", {})
    role_data = obs.get("role_data", {})
    nps = kpis.get("nps_score", 50)
    satisfaction = kpis.get("customer_satisfaction", 0.5)
    stability = kpis.get("product_stability", 1.0)
    features = kpis.get("features_shipped", 0)
    bugs = role_data.get("bug_reports", [])
    day = obs.get("day", 1)
    shipped = _shipped_features(obs)

    # Evaluate periodically
    if day % 5 == 1:
        shipped_str = f" Shipped: {', '.join(shipped[:3])}." if shipped else " No features shipped yet."
        return {
            "action_type": "EVALUATE_PRODUCT",
            "target": "quarterly product assessment",
            "parameters": {},
            "reasoning": f"Day {day} evaluation: NPS={nps:.0f}, stability={stability:.0%}, satisfaction={satisfaction:.0%}, features={features}.{shipped_str} {'Product improving.' if nps > 40 else 'Need to see more progress.'}",
            "message": f"dev: product eval — {'impressed with progress' if features > 0 else 'still waiting for key features'}. Stability is {stability:.0%}.{' Love ' + shipped[0] + '!' if shipped else ''}",
        }

    # Critical bugs — escalate
    critical_bugs = [b for b in bugs if b.get("severity") == "critical"]
    if critical_bugs and stability < 0.6:
        bug = critical_bugs[0]
        return {
            "action_type": "ESCALATE_ISSUE",
            "target": bug.get("name", "critical issue"),
            "parameters": {},
            "reasoning": f"Critical bug '{bug.get('name', '')}' with stability at {stability:.0%}. This is blocking our team's work. Need immediate fix or we'll evaluate alternatives.",
            "message": f"dev: critical issue — '{bug.get('name', '')}' is blocking us. Stability at {stability:.0%} is unacceptable. Please prioritize.",
        }

    # Happy customer — refer
    if nps > 40 and stability > 0.7 and features > 1:
        return {
            "action_type": "REFER_LEAD",
            "target": "industry colleague",
            "parameters": {},
            "reasoning": f"Satisfied with the product: NPS={nps:.0f}, stability={stability:.0%}, {features} features shipped. Referring a colleague in our industry. {shipped[0] if shipped else 'Product'} is a strong differentiator.",
            "message": f"sales: referring a colleague — they have similar needs. The {shipped[0] if shipped else 'product'} sold them. Keep up the momentum!",
        }

    # Renew contract
    if features > 0 and satisfaction > 0.4 and day > 10:
        return {
            "action_type": "RENEW_CONTRACT",
            "target": "annual contract",
            "parameters": {},
            "reasoning": f"Product trending positively: {features} features shipped, NPS={nps:.0f}, satisfaction={satisfaction:.0%}. Renewing to lock in pricing and show commitment.",
            "message": f"sales: renewing our contract. {shipped[0] if shipped else 'Recent updates'} made the difference. Looking forward to what's next on the roadmap.",
        }

    # Give constructive feedback
    if features > 0 and random.random() < 0.3:
        if shipped:
            return {
                "action_type": "GIVE_FEEDBACK",
                "target": "product feedback",
                "parameters": {"feedback": f"{shipped[0]} is great but we'd love to see better reporting and mobile access. Overall trajectory is positive."},
                "reasoning": f"Providing constructive feedback: {shipped[0]} works well, but there are gaps. NPS is {nps:.0f}. Want to help the team improve.",
                "message": f"dev: {shipped[0]} is solid! Would love better reporting next. sales: overall happy with direction.",
            }

    # Request a feature with business justification
    feature_requests = [
        ("Mobile App", "Our field teams need mobile access — 40% of our users are remote and can't use the desktop version effectively"),
        ("Webhooks", "We need real-time integrations with our stack — currently manually syncing data twice daily is costly"),
        ("Custom Reports", "Executive team needs custom analytics — current reporting doesn't meet board requirements"),
        ("Bulk Import", "Migrating 50K records from our old system is blocking full adoption across our organization"),
        ("SSO Integration", "IT security policy requires SSO for any vendor tool — this is a hard requirement for renewal"),
        ("Audit Logging", "Compliance team needs full audit trail — regulatory requirement in our industry"),
        ("API Rate Limits", "Our integration hitting rate limits during peak hours — need enterprise-grade throughput"),
    ]
    feat_name, desc = random.choice(feature_requests)
    return {
        "action_type": "REQUEST_FEATURE",
        "target": feat_name,
        "parameters": {"description": desc},
        "reasoning": f"Requesting {feat_name}: {desc}. This would significantly improve our experience (satisfaction={satisfaction:.0%}). Currently at NPS={nps:.0f}.",
        "message": f"dev: we really need {feat_name}. {desc}. sales: this could be a deal-maker for others in our industry too.",
    }


# ── Negative example generator ────────────────────────────────────────────

def generate_negative_example(role: str, obs: dict, turn: int) -> dict | None:
    """Generate a mediocre/bad action for GRPO contrast. Returns None if not applicable."""
    kpis = obs.get("kpis", {})
    role_data = obs.get("role_data", {})
    valid_actions = ROLE_ACTIONS.get(role, [])
    if not valid_actions:
        return None

    # Pick a random valid action that's NOT the optimal one
    action = random.choice(valid_actions)

    templates = {
        "ceo": {
            "action_type": action,
            "target": "general",
            "parameters": {},
            "reasoning": "Doing this because it seems like a good idea.",
            "message": "team: let's do better.",
        },
        "dev": {
            "action_type": action,
            "target": "something",
            "parameters": {},
            "reasoning": "Working on this now.",
            "message": "team: busy.",
        },
        "marketing": {
            "action_type": action,
            "target": "campaign",
            "parameters": {},
            "reasoning": "Running a campaign.",
            "message": "team: marketing stuff.",
        },
        "sales": {
            "action_type": action,
            "target": "customer",
            "parameters": {},
            "reasoning": "Working on sales.",
            "message": "team: working on it.",
        },
        "content": {
            "action_type": action,
            "target": "content piece",
            "parameters": {},
            "reasoning": "Writing content.",
            "message": "team: writing.",
        },
        "hr": {
            "action_type": action,
            "target": "team",
            "parameters": {},
            "reasoning": "Doing HR things.",
            "message": "team: planning.",
        },
    }

    return templates.get(role)


EXPERT_POLICIES = {
    "ceo": expert_ceo,
    "dev": expert_dev,
    "marketing": expert_marketing,
    "sales": expert_sales,
    "content": expert_content,
    "hr": expert_hr,
    "customer": expert_customer,
}


# ── Main generation loop ─────────────────────────────────────────────

def generate_episode(episode: int, scenario: str, days: int,
                     include_negative: bool = False, neg_ratio: float = 0.15) -> list[dict]:
    """Run one episode with expert policies, return trajectory records."""
    os.environ.pop("GOOGLE_SHEETS_CREDENTIALS", None)
    os.environ.pop("GOOGLE_SHEETS_SPREADSHEET_ID", None)
    env = OfficeOsEnvironment(scenario=scenario)
    obs = env.reset()

    agents = {role: LLMAgent(role=role) for role in AGENT_ROLES}

    records = []
    turn = 0
    role_index = 0
    reward_totals = {role: 0.0 for role in AGENT_ROLES}
    day_rewards = {role: 0.0 for role in AGENT_ROLES}

    while not obs.done and obs.day <= days:
        role = AGENT_ROLES[role_index % len(AGENT_ROLES)]
        role_index += 1
        turn += 1

        role_data = env._get_role_data(role)
        obs_dict = {
            "agent_id": role, "day": obs.day, "phase": obs.phase,
            "kpis": obs.kpis, "budget_remaining": obs.budget_remaining,
            "recent_actions": obs.recent_actions, "messages": obs.messages,
            "events": obs.events, "role_data": role_data,
            "last_action_result": obs.last_action_result,
            "done": obs.done, "reward": obs.reward,
        }

        user_msg = agents[role]._build_user_message(obs_dict, turn)

        # Expert policy picks the optimal action
        action_dict = EXPERT_POLICIES[role](obs_dict, turn)

        # Execute in environment
        action = OfficeOsAction(
            agent_id=role,
            action_type=action_dict["action_type"],
            target=action_dict.get("target", ""),
            parameters=action_dict.get("parameters", {}),
            reasoning=action_dict.get("reasoning", ""),
            message=action_dict.get("message"),
        )
        obs = env.step(action)

        reward_totals[role] += obs.reward
        day_rewards[role] += obs.reward

        # Record expert trajectory (high reward multiplier for quality reasoning)
        reasoning_words = len(action_dict.get("reasoning", "").split())
        quality_bonus = min(0.2, reasoning_words * 0.005)  # Up to +0.2 for detailed reasoning
        adjusted_reward = obs.reward + quality_bonus

        records.append({
            "role": role,
            "system_prompt": ROLE_PROMPTS[role],
            "user_message": user_msg,
            "assistant_response": action_dict,
            "reward": adjusted_reward,
            "day": obs.day,
            "turn": turn,
            "metadata": {
                "success": obs.last_action_result.get("success", False),
                "episode": episode,
                "scenario": scenario,
                "expert": True,
                "quality": "high",
            },
        })

        # Optionally generate a negative example for GRPO variance
        if include_negative and role != "customer" and random.random() < neg_ratio:
            neg_action = generate_negative_example(role, obs_dict, turn)
            if neg_action:
                records.append({
                    "role": role,
                    "system_prompt": ROLE_PROMPTS[role],
                    "user_message": user_msg,
                    "assistant_response": neg_action,
                    "reward": max(0.0, obs.reward * 0.2),  # Low reward for bad action
                    "day": obs.day,
                    "turn": turn,
                    "metadata": {
                        "success": False,
                        "episode": episode,
                        "scenario": scenario,
                        "expert": False,
                        "quality": "low",
                    },
                })

        # Day boundary logging
        if turn % TURNS_PER_DAY == 0:
            kpis = env._market.get_all_kpis()
            day_str = " ".join(f"{r[:3]}={v:+.1f}" for r, v in day_rewards.items())
            logger.info(
                f"  [Ep{episode}] Day {obs.day - 1} | "
                f"Rev=${kpis['total_revenue']:,.0f} | "
                f"Pipeline=${kpis['pipeline_value']:,.0f} | "
                f"Features={kpis['features_shipped']} | "
                f"Content={kpis['content_published']} | "
                f"Rewards: {day_str}"
            )
            day_rewards = {role: 0.0 for role in AGENT_ROLES}

    kpis = env._market.get_all_kpis()
    won = len([c for c in env._market.customers if c.stage == "closed_won"])
    logger.info(
        f"  Episode {episode} done: Rev=${kpis['total_revenue']:,.0f} | "
        f"Won={won} | Features={kpis['features_shipped']} | "
        f"Content={kpis['content_published']} | "
        f"Records={len(records)}"
    )
    return records


def main():
    parser = argparse.ArgumentParser(description="Generate expert training data (v2)")
    parser.add_argument("--episodes", type=int, default=50, help="Number of episodes (default: 50)")
    parser.add_argument("--days", type=int, default=EPISODE_DAYS, help=f"Days per episode (default: {EPISODE_DAYS})")
    parser.add_argument("--scenarios", type=str, nargs="+",
                        default=["baseline", "competitor", "series_a", "churn", "viral"],
                        help="Scenarios to cycle through")
    parser.add_argument("--output-dir", type=str, default="training_data", help="Output directory")
    parser.add_argument("--min-reward", type=float, default=None,
                        help="Filter: only keep trajectories with reward >= this value")
    parser.add_argument("--include-negative", action="store_true",
                        help="Include negative examples for GRPO contrast")
    parser.add_argument("--neg-ratio", type=float, default=0.15,
                        help="Ratio of negative examples per turn (default: 0.15)")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    logger.info("=" * 60)
    logger.info("Expert Training Data Generator v2")
    logger.info(f"  Episodes:     {args.episodes}")
    logger.info(f"  Days/episode: {args.days}")
    logger.info(f"  Scenarios:    {args.scenarios}")
    logger.info(f"  Output:       {args.output_dir}")
    logger.info(f"  Negatives:    {'yes (' + str(args.neg_ratio) + ')' if args.include_negative else 'no'}")
    logger.info("=" * 60)

    all_records = []
    for ep in range(1, args.episodes + 1):
        scenario = args.scenarios[(ep - 1) % len(args.scenarios)]
        logger.info(f"\nEpisode {ep}/{args.episodes}: scenario={scenario}")
        records = generate_episode(ep, scenario, args.days,
                                   include_negative=args.include_negative,
                                   neg_ratio=args.neg_ratio)
        all_records.extend(records)

    # Optional reward filtering
    if args.min_reward is not None:
        before = len(all_records)
        all_records = [r for r in all_records if r["reward"] >= args.min_reward]
        logger.info(f"\nFiltered: {before} -> {len(all_records)} records (min_reward={args.min_reward})")

    # Save all records
    output_path = os.path.join(args.output_dir, "expert_trajectories.jsonl")
    with open(output_path, "w") as f:
        for record in all_records:
            f.write(json.dumps(record) + "\n")

    # Save per-role files
    for role in AGENT_ROLES:
        role_records = [r for r in all_records if r["role"] == role]
        role_path = os.path.join(args.output_dir, f"expert_{role}.jsonl")
        with open(role_path, "w") as f:
            for record in role_records:
                f.write(json.dumps(record) + "\n")
        high = sum(1 for r in role_records if r.get("metadata", {}).get("quality") == "high")
        low = sum(1 for r in role_records if r.get("metadata", {}).get("quality") == "low")
        logger.info(f"  {role}: {len(role_records)} records ({high} expert, {low} negative) -> {role_path}")

    # Summary stats
    logger.info(f"\n{'=' * 60}")
    logger.info(f"DONE: {len(all_records)} total trajectories")
    logger.info(f"Output: {output_path}")

    # Reward distribution per role
    logger.info("\nReward stats per role:")
    for role in AGENT_ROLES:
        rewards = [r["reward"] for r in all_records if r["role"] == role]
        if rewards:
            avg = sum(rewards) / len(rewards)
            high_q = [r["reward"] for r in all_records if r["role"] == role and r.get("metadata", {}).get("quality") == "high"]
            low_q = [r["reward"] for r in all_records if r["role"] == role and r.get("metadata", {}).get("quality") == "low"]
            high_avg = sum(high_q) / len(high_q) if high_q else 0
            low_avg = sum(low_q) / len(low_q) if low_q else 0
            logger.info(f"  {role}: n={len(rewards)}, avg={avg:+.2f} (expert={high_avg:+.2f}, neg={low_avg:+.2f})")

    logger.info(f"\nTo send: python send_training.py")


if __name__ == "__main__":
    main()
