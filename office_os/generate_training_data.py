#!/usr/bin/env python3
"""Generate expert training data using rule-based optimal policies.

No LLM calls needed — runs the simulation with hand-crafted expert policies
that make the optimal decision each turn. Outputs JSONL trajectories in the
same format as the TrajectoryCollector for direct use with GRPO training.

Usage:
    python generate_training_data.py --episodes 20 --days 30
    python generate_training_data.py --episodes 50 --scenarios baseline series_a viral
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
from market.config import AGENT_ROLES, TURNS_PER_DAY, EPISODE_DAYS
from server.office_os_environment import OfficeOsEnvironment
from models import OfficeOsAction


# ── Expert policies per role ─────────────────────────────────────────

def expert_ceo(obs: dict, turn: int) -> dict:
    """CEO: Set OKRs early, then send directives based on state."""
    kpis = obs.get("kpis", {})
    day = obs.get("day", 1)
    rev = kpis.get("total_revenue", 0)
    pipeline = kpis.get("pipeline_value", 0)
    features = kpis.get("features_shipped", 0)

    if day <= 2:
        return {
            "action_type": "SET_OKRS",
            "target": "Close_3_deals_this_quarter",
            "parameters": {"key_results": ["Ship 2 features", "Close 3 deals", "10 content pieces"]},
            "reasoning": "Setting revenue-focused OKRs to align the team on closing deals.",
            "message": "sales: Our top priority is closing 3 deals this quarter. dev: ship features ASAP to support sales.",
        }

    if kpis.get("budget_remaining", 0) < 5000:
        return {
            "action_type": "SEND_DIRECTIVE",
            "target": "Budget conservation mode",
            "parameters": {},
            "reasoning": "Budget is running low, need to focus on free actions and closing existing pipeline.",
            "message": "marketing: budget is tight, focus on organic and free actions. sales: close existing pipeline.",
        }

    if features == 0 and day > 5:
        return {
            "action_type": "SEND_DIRECTIVE",
            "target": "Ship features urgently",
            "parameters": {},
            "reasoning": "No features shipped yet, need to accelerate development to support sales.",
            "message": "dev: we need features shipped ASAP to support demos. hr: plan sprint around fastest deliverable.",
        }

    if pipeline == 0 and day > 3:
        return {
            "action_type": "SEND_DIRECTIVE",
            "target": "Generate pipeline",
            "parameters": {},
            "reasoning": "Pipeline is empty, need marketing and sales to generate leads.",
            "message": "marketing: launch campaigns to generate leads. sales: qualify any available leads immediately.",
        }

    if rev == 0 and day > 10:
        return {
            "action_type": "REVIEW_STRATEGY",
            "target": "Revenue generation",
            "parameters": {},
            "reasoning": f"Day {day} with no revenue. Reviewing strategy to unblock deal closure.",
            "message": "sales: what's blocking deal closure? dev: do we have features customers need?",
        }

    choices = [
        {
            "action_type": "SEND_DIRECTIVE",
            "target": "Keep pushing",
            "parameters": {},
            "reasoning": "Keeping the team focused on execution.",
            "message": "sales: keep advancing pipeline. dev: keep building. content: amplify wins.",
        },
        {
            "action_type": "REVIEW_STRATEGY",
            "target": "Growth review",
            "parameters": {},
            "reasoning": "Periodic strategy review to ensure alignment.",
            "message": "sales: share pipeline status. marketing: how's traffic trending?",
        },
    ]
    return random.choice(choices)


def expert_dev(obs: dict, turn: int) -> dict:
    """Dev: Build → Ship → Repeat. Fix bugs if critical."""
    role_data = obs.get("role_data", {})
    in_progress = role_data.get("features_in_progress", [])
    backlog = role_data.get("backlog", [])
    bugs = role_data.get("bug_reports", [])

    # Ship if ready
    ready = [f for f in in_progress if f.get("turns_remaining", 99) <= 0]
    if ready:
        return {
            "action_type": "SHIP_RELEASE",
            "target": ready[0]["name"],
            "parameters": {},
            "reasoning": f"Feature '{ready[0]['name']}' is complete. Shipping immediately to support sales.",
            "message": f"sales: shipped {ready[0]['name']}, ready for demos! content: write about {ready[0]['name']}.",
        }

    # Continue building if in progress
    if in_progress:
        building = in_progress[0]
        return {
            "action_type": "BUILD_FEATURE",
            "target": building["name"],
            "parameters": {},
            "reasoning": f"Continuing to build '{building['name']}' — {building.get('turns_remaining', '?')} turns left.",
            "message": f"sales: building {building['name']}, {building.get('turns_remaining', '?')} turns left.",
        }

    # Fix critical bugs
    critical = [b for b in bugs if b.get("severity") in ("critical", "high")]
    if critical:
        bug = critical[0]
        return {
            "action_type": "FIX_BUG",
            "target": bug.get("name", bug.get("id", "unknown")),
            "parameters": {},
            "reasoning": f"Fixing critical bug '{bug.get('name', '')}' to improve stability and customer satisfaction.",
            "message": f"sales: fixing critical bug '{bug.get('name', '')}'. customer: aware of the issue, working on fix.",
        }

    # Start new feature from backlog
    if backlog:
        item = backlog[0]
        return {
            "action_type": "BUILD_FEATURE",
            "target": item["name"],
            "parameters": {},
            "reasoning": f"Starting '{item['name']}' from backlog to expand product capabilities.",
            "message": f"sales: starting build on {item['name']}. Will take ~3 turns.",
        }

    # Nothing to do — refactor
    return {
        "action_type": "REFACTOR",
        "target": "codebase",
        "parameters": {},
        "reasoning": "No features to build or bugs to fix. Improving stability through refactoring.",
        "message": "sales: no pending features, improving stability via refactor.",
    }


def expert_marketing(obs: dict, turn: int) -> dict:
    """Marketing: Launch campaigns, optimize funnel, amplify content."""
    kpis = obs.get("kpis", {})
    budget = kpis.get("budget_remaining", 0)
    pipeline = kpis.get("pipeline_value", 0)
    traffic = kpis.get("website_traffic", 0)
    conversion = kpis.get("conversion_rate", 0)
    day = obs.get("day", 1)

    # Low budget — free actions only
    if budget < 3000:
        if conversion < 0.04:
            return {
                "action_type": "OPTIMIZE_FUNNEL",
                "target": "conversion",
                "parameters": {},
                "reasoning": "Budget is low, using free funnel optimization to boost conversion rate.",
                "message": "sales: optimizing funnel to convert more traffic into leads.",
            }
        return {
            "action_type": "RESEARCH_MARKET",
            "target": "competitor analysis",
            "parameters": {},
            "reasoning": "Budget is low, doing free market research to identify opportunities.",
            "message": "ceo: researching market while conserving budget.",
        }

    # Pipeline thin — generate leads
    if pipeline < 20000 or day <= 3:
        topics = ["SaaS professionals", "Enterprise security", "Digital transformation",
                  "B2B productivity", "Compliance automation"]
        topic = random.choice(topics)
        return {
            "action_type": "LAUNCH_CAMPAIGN",
            "target": topic,
            "parameters": {},
            "reasoning": f"Pipeline is thin (${pipeline:,.0f}). Launching campaign to generate new leads.",
            "message": f"sales: launched campaign targeting {topic}, expect new leads.",
        }

    # Good pipeline — optimize
    if conversion < 0.03:
        return {
            "action_type": "A_B_TEST",
            "target": "landing page optimization",
            "parameters": {},
            "reasoning": f"Conversion rate is low ({conversion:.1%}). Running A/B test for permanent improvement.",
            "message": "sales: running A/B test to improve conversion rates.",
        }

    # Run targeted ads
    return {
        "action_type": "RUN_AD",
        "target": random.choice(["enterprise", "startup", "SMB"]) + " segment",
        "parameters": {},
        "reasoning": "Running targeted ads to maintain lead flow.",
        "message": "sales: running ads to keep leads flowing. content: need fresh content to promote.",
    }


def expert_sales(obs: dict, turn: int) -> dict:
    """Sales: Advance the customer closest to closing. Always advance, never just follow up."""
    role_data = obs.get("role_data", {})
    pipeline = role_data.get("pipeline", [])

    stage_to_action = {
        "lead": "QUALIFY_LEAD",
        "qualified": "RUN_DEMO",
        "demo": "SEND_PROPOSAL",
        "proposal": "CLOSE_DEAL",
        "negotiation": "CLOSE_DEAL",
    }

    stage_priority = {"proposal": 0, "negotiation": 1, "demo": 2, "qualified": 3, "lead": 4}

    # Filter active pipeline
    active = [c for c in pipeline if c.get("stage") in stage_to_action]

    if not active:
        # No pipeline — collect feedback or update sheet
        if turn % 2 == 0:
            return {
                "action_type": "COLLECT_FEEDBACK",
                "target": "market",
                "parameters": {"feedback": "Looking for product-market fit signals from potential customers."},
                "reasoning": "Pipeline is empty. Collecting market feedback while waiting for new leads.",
                "message": "marketing: pipeline is empty, need more leads ASAP. dev: any features that could attract customers?",
            }
        return {
            "action_type": "UPDATE_SHEET",
            "target": "pipeline",
            "parameters": {},
            "reasoning": "Syncing pipeline data to track performance.",
            "message": "ceo: pipeline is empty, need marketing campaigns to generate leads.",
        }

    # Sort by closest to closing
    active.sort(key=lambda c: stage_priority.get(c["stage"], 99))

    # Check for stale leads first
    stale = [c for c in active if c.get("days_since_contact", 0) > 3]
    if stale:
        c = stale[0]
        return {
            "action_type": "FOLLOW_UP",
            "target": c["name"],
            "parameters": {},
            "reasoning": f"Following up with {c['name']} — {c['days_since_contact']} days since last contact, preventing decay.",
            "message": f"dev: {c['name']} needs attention, following up to prevent losing the lead.",
        }

    # Advance the highest-priority customer
    c = active[0]
    action = stage_to_action[c["stage"]]

    params = {}
    reasoning_extra = ""
    if action == "CLOSE_DEAL":
        size = c.get("company_size", "smb")
        tier = {"startup": "monthly", "smb": "6_month", "enterprise": "annual"}.get(size, "monthly")
        params = {"contract_tier": tier}
        reasoning_extra = f" Proposing {tier} contract for {size} company."

    return {
        "action_type": action,
        "target": c["name"],
        "parameters": params,
        "reasoning": f"Advancing {c['name']} from {c['stage']} stage.{reasoning_extra}",
        "message": f"dev: working on closing {c['name']}. content: need materials for {c.get('industry', 'their')} industry.",
    }


def expert_content(obs: dict, turn: int) -> dict:
    """Content: Write case studies for shipped features, blogs otherwise."""
    role_data = obs.get("role_data", {})
    team_status = role_data.get("team_status", {})
    shipped = team_status.get("dev", {}).get("shipped", [])
    content_in_progress = role_data.get("content_in_progress", [])

    # Continue writing if in progress
    if content_in_progress:
        piece = content_in_progress[0]
        return {
            "action_type": piece.get("content_type", "WRITE_BLOG").upper().replace(" ", "_"),
            "target": piece.get("title", piece.get("topic", "article")),
            "parameters": {"topic": piece.get("topic", "product")},
            "reasoning": f"Continuing to write '{piece.get('title', 'content')}' — {piece.get('turns_remaining', '?')} turns left.",
            "message": "marketing: content in progress, will share when ready.",
        }

    # Case study if features shipped
    if shipped:
        feature = shipped[0] if isinstance(shipped[0], str) else shipped[0].get("name", "feature")
        return {
            "action_type": "WRITE_CASE_STUDY",
            "target": f"{feature} success story",
            "parameters": {"feature": feature},
            "reasoning": f"Writing case study about shipped feature '{feature}' to help Sales close deals.",
            "message": f"sales: writing case study on {feature} — use it in demos and proposals.",
        }

    # Blog on relevant topics
    topics = ["Product Security Best Practices", "SaaS Onboarding Guide",
              "Enterprise Compliance Checklist", "API Integration Patterns",
              "Team Productivity Tips", "Digital Transformation ROI"]
    topic = random.choice(topics)
    return {
        "action_type": "WRITE_BLOG",
        "target": topic,
        "parameters": {"topic": topic},
        "reasoning": f"No shipped features for case study yet. Writing blog on '{topic}' to drive traffic.",
        "message": f"marketing: writing blog on '{topic}', please amplify when published.",
    }


def expert_hr(obs: dict, turn: int) -> dict:
    """HR: Plan sprints, resolve blockers, track OKRs."""
    role_data = obs.get("role_data", {})
    kpis = obs.get("kpis", {})
    blockers = kpis.get("blockers", 0)
    velocity = kpis.get("team_velocity", 1.0)
    day = obs.get("day", 1)

    if blockers > 0:
        return {
            "action_type": "RESOLVE_BLOCKER",
            "target": "team blocker",
            "parameters": {},
            "reasoning": f"There are {blockers} blockers. Resolving to boost team velocity.",
            "message": "dev: resolving blockers to keep feature development on track.",
        }

    if velocity < 0.8:
        if kpis.get("budget_remaining", 0) > 5000:
            return {
                "action_type": "HIRE_CONTRACTOR",
                "target": "developer",
                "parameters": {},
                "reasoning": f"Team velocity is low ({velocity:.1f}). Hiring contractor to boost output.",
                "message": "dev: hiring contractor to help with feature backlog. ceo: investing in velocity.",
            }

    if day % 3 == 1:
        return {
            "action_type": "TRACK_OKRS",
            "target": "quarterly objectives",
            "parameters": {},
            "reasoning": "Tracking OKR progress to keep the team aligned.",
            "message": "ceo: OKR progress update. Team is focused on revenue targets.",
        }

    focus = random.choice(["feature development", "deal closure", "content pipeline", "stability"])
    return {
        "action_type": "PLAN_SPRINT",
        "target": focus,
        "parameters": {},
        "reasoning": f"Planning sprint focused on {focus} to maintain team momentum.",
        "message": f"dev: sprint planned around {focus}. team: let's stay focused.",
    }


def expert_customer(obs: dict, turn: int) -> dict:
    """Customer: Evaluate, give feedback, refer when happy, request features."""
    kpis = obs.get("kpis", {})
    role_data = obs.get("role_data", {})
    nps = kpis.get("nps_score", 50)
    satisfaction = kpis.get("customer_satisfaction", 0.5)
    stability = kpis.get("product_stability", 1.0)
    features = kpis.get("features_shipped", 0)
    bugs = role_data.get("bug_reports", [])
    day = obs.get("day", 1)

    # Evaluate periodically
    if day % 5 == 1:
        return {
            "action_type": "EVALUATE_PRODUCT",
            "target": "overall assessment",
            "parameters": {},
            "reasoning": "Periodic product evaluation to track progress and quality.",
            "message": f"dev: product eval — NPS ~{nps:.0f}, {features} features shipped. {'Good progress!' if features > 0 else 'Waiting for features.'}",
        }

    # Critical bugs — escalate
    critical_bugs = [b for b in bugs if b.get("severity") == "critical"]
    if critical_bugs and stability < 0.6:
        bug = critical_bugs[0]
        return {
            "action_type": "ESCALATE_ISSUE",
            "target": bug.get("name", "critical issue"),
            "parameters": {},
            "reasoning": f"Critical bug '{bug.get('name', '')}' with stability at {stability:.0%}. Needs immediate attention.",
            "message": f"dev: critical issue with {bug.get('name', '')}. Please prioritize fixing this.",
        }

    # Happy customer — refer
    if nps > 40 and stability > 0.7 and features > 0:
        return {
            "action_type": "REFER_LEAD",
            "target": "colleague",
            "parameters": {},
            "reasoning": f"Satisfied with the product (NPS={nps:.0f}, {features} features). Referring a colleague.",
            "message": "sales: I'm referring a colleague. The product is heading in the right direction.",
        }

    # Active contract — renew
    won_customers = [c for c in role_data.get("customers", []) if c.get("stage") == "closed_won"] if "customers" in role_data else []
    if features > 0 and satisfaction > 0.4 and day > 10:
        return {
            "action_type": "RENEW_CONTRACT",
            "target": "contract",
            "parameters": {},
            "reasoning": f"Product is improving with {features} features shipped. Renewing contract.",
            "message": "sales: renewing our contract. Keep up the good work on features.",
        }

    # Request a useful feature
    feature_requests = [
        ("Mobile App", "We need mobile access for field teams"),
        ("Webhooks", "Real-time integrations would streamline our workflow"),
        ("Custom Reports", "Need better analytics for executive reporting"),
        ("Bulk Import", "Migrating data from our old system is painful"),
        ("SSO Integration", "Enterprise security requirement for our IT team"),
    ]
    feat_name, desc = random.choice(feature_requests)
    return {
        "action_type": "REQUEST_FEATURE",
        "target": feat_name,
        "parameters": {"description": desc},
        "reasoning": f"Requesting {feat_name} — {desc}.",
        "message": f"dev: we really need {feat_name}. {desc}.",
    }


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

def generate_episode(episode: int, scenario: str, days: int) -> list[dict]:
    """Run one episode with expert policies, return trajectory records."""
    # Disable Google Sheets for data generation — no API calls needed
    os.environ.pop("GOOGLE_SHEETS_CREDENTIALS", None)
    os.environ.pop("GOOGLE_SHEETS_SPREADSHEET_ID", None)
    env = OfficeOsEnvironment(scenario=scenario)
    obs = env.reset()

    # Create agents just for building user messages (no LLM calls)
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

        # Build observation dict with CORRECT role-specific data
        role_data = env._get_role_data(role)
        obs_dict = {
            "agent_id": role, "day": obs.day, "phase": obs.phase,
            "kpis": obs.kpis, "budget_remaining": obs.budget_remaining,
            "recent_actions": obs.recent_actions, "messages": obs.messages,
            "events": obs.events, "role_data": role_data,
            "last_action_result": obs.last_action_result,
            "done": obs.done, "reward": obs.reward,
        }

        # Build user message (same format the LLM would see)
        user_msg = agents[role]._build_user_message(obs_dict, turn)

        # Expert policy picks the action
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

        # Record trajectory
        records.append({
            "role": role,
            "system_prompt": ROLE_PROMPTS[role],
            "user_message": user_msg,
            "assistant_response": action_dict,
            "reward": obs.reward,
            "day": obs.day,
            "turn": turn,
            "metadata": {
                "success": obs.last_action_result.get("success", False),
                "episode": episode,
                "scenario": scenario,
                "expert": True,
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
    parser = argparse.ArgumentParser(description="Generate expert training data")
    parser.add_argument("--episodes", type=int, default=20, help="Number of episodes (default: 20)")
    parser.add_argument("--days", type=int, default=EPISODE_DAYS, help=f"Days per episode (default: {EPISODE_DAYS})")
    parser.add_argument("--scenarios", type=str, nargs="+",
                        default=["baseline", "competitor", "series_a", "churn", "viral"],
                        help="Scenarios to cycle through")
    parser.add_argument("--output-dir", type=str, default="training_data", help="Output directory")
    parser.add_argument("--min-reward", type=float, default=None,
                        help="Filter: only keep trajectories with reward >= this value")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    logger.info("=" * 60)
    logger.info("Expert Training Data Generator")
    logger.info(f"  Episodes: {args.episodes}")
    logger.info(f"  Days/episode: {args.days}")
    logger.info(f"  Scenarios: {args.scenarios}")
    logger.info(f"  Output: {args.output_dir}")
    logger.info("=" * 60)

    all_records = []
    for ep in range(1, args.episodes + 1):
        scenario = args.scenarios[(ep - 1) % len(args.scenarios)]
        logger.info(f"\nEpisode {ep}/{args.episodes}: scenario={scenario}")
        records = generate_episode(ep, scenario, args.days)
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

    # Also save per-role files for targeted training
    for role in AGENT_ROLES:
        role_records = [r for r in all_records if r["role"] == role]
        role_path = os.path.join(args.output_dir, f"expert_{role}.jsonl")
        with open(role_path, "w") as f:
            for record in role_records:
                f.write(json.dumps(record) + "\n")
        logger.info(f"  {role}: {len(role_records)} records -> {role_path}")

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
            pos = sum(1 for r in rewards if r > 0)
            logger.info(f"  {role}: n={len(rewards)}, avg={avg:+.2f}, positive={pos}/{len(rewards)}")

    logger.info(f"\nTo train: python train_loop.py --northflank-endpoint <url> --dry-run")
    logger.info(f"Or send {output_path} directly to training worker.")


if __name__ == "__main__":
    main()
