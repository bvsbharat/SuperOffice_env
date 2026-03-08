#!/usr/bin/env python3
"""
Training loop: run 10 full 90-day episodes, train after each.

Each episode uses a different scenario (cycling through all 5).
Trajectories are collected during the episode and sent to the
training worker after the episode completes. Subsequent episodes
use the LoRA models trained from prior episodes.

Usage:
    # With Northflank endpoint:
    python train_loop.py --northflank-endpoint http://your-endpoint

    # Customize episodes/scenarios:
    python train_loop.py --episodes 10 --northflank-endpoint http://...

    # Dry run (no training, just collect trajectories):
    python train_loop.py --dry-run --northflank-endpoint http://...
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load .env
for _d in [os.path.dirname(os.path.abspath(__file__)),
           os.path.dirname(os.path.dirname(os.path.abspath(__file__)))]:
    _env_file = os.path.join(_d, ".env")
    if os.path.exists(_env_file):
        with open(_env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, value = line.partition("=")
                    os.environ.setdefault(key.strip(), value.strip())

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

from agents.llm_agent import LLMAgent
from market.config import AGENT_ROLES, TURNS_PER_DAY
from server.office_os_environment import OfficeOsEnvironment
from models import OfficeOsAction
from training.collector import TrajectoryCollector
from training.trainer import RemoteTrainer

SCENARIOS = ["baseline", "competitor", "series_a", "churn", "viral"]


def run_episode(
    episode: int,
    scenario: str,
    agents: dict[str, LLMAgent],
    collector: TrajectoryCollector,
    days: int = 90,
) -> dict:
    """Run a single 90-day episode and collect trajectories. Returns summary."""
    env = OfficeOsEnvironment(scenario=scenario)
    obs = env.reset()

    reward_totals = {role: 0.0 for role in AGENT_ROLES}
    turn = 0
    role_index = 0

    logger.info(f"Episode {episode} starting: scenario={scenario}, days={days}")

    while not obs.done and obs.day <= days:
        role = AGENT_ROLES[role_index % len(AGENT_ROLES)]
        agent = agents[role]
        role_index += 1
        turn += 1

        # Agent decides
        obs_dict = {
            "agent_id": obs.agent_id, "day": obs.day, "phase": obs.phase,
            "kpis": obs.kpis, "budget_remaining": obs.budget_remaining,
            "recent_actions": obs.recent_actions, "messages": obs.messages,
            "events": obs.events, "role_data": obs.role_data,
            "last_action_result": obs.last_action_result,
            "done": obs.done, "reward": obs.reward,
        }
        action_dict = agent.decide(obs_dict, turn)

        # Execute
        action = OfficeOsAction(
            agent_id=role,
            action_type=action_dict["action_type"],
            target=action_dict.get("target", ""),
            parameters=action_dict.get("parameters", {}),
            reasoning=action_dict.get("reasoning", ""),
            message=action_dict.get("message"),
        )
        obs = env.step(action)

        # Record trajectory
        collector.record(
            role=role,
            system_prompt=agent.system_prompt,
            user_message=agent.last_user_message,
            assistant_response=action_dict,
            reward=obs.reward,
            day=obs.day,
            turn=turn,
            metadata={
                "success": obs.last_action_result.get("success", False),
                "episode": episode,
                "scenario": scenario,
            },
        )

        reward_totals[role] += obs.reward

        # Day boundary logging
        if turn % TURNS_PER_DAY == 0:
            kpis = env._market.get_all_kpis()
            logger.info(
                f"  [Ep{episode}] Day {obs.day - 1} | "
                f"Rev=${kpis['total_revenue']:,.0f} | "
                f"Pipeline=${kpis['pipeline_value']:,.0f} | "
                f"Features={kpis['features_shipped']} | "
                f"Content={kpis['content_published']}"
            )

        # Periodic reflection
        if turn % (10 * len(AGENT_ROLES)) == 0:
            for r, a in agents.items():
                a.reflect(turn, obs_dict)

    # Episode summary
    kpis = env._market.get_all_kpis()
    won = len([c for c in env._market.customers if c.stage == "closed_won"])
    lost = len([c for c in env._market.customers if c.stage == "closed_lost"])

    summary = {
        "episode": episode,
        "scenario": scenario,
        "total_revenue": kpis["total_revenue"],
        "features_shipped": kpis["features_shipped"],
        "content_published": kpis["content_published"],
        "deals_won": won,
        "deals_lost": lost,
        "reward_totals": reward_totals,
        "turns": turn,
        "pending_trajectories": collector.pending_count(),
    }

    logger.info(f"Episode {episode} complete: scenario={scenario}")
    logger.info(f"  Revenue=${kpis['total_revenue']:,.0f} | Won={won} Lost={lost}")
    logger.info(f"  Rewards: {', '.join(f'{r}={v:+.1f}' for r, v in reward_totals.items())}")
    logger.info(f"  Trajectories pending: {collector.pending_count()}")

    return summary


def main():
    parser = argparse.ArgumentParser(description="Office OS Training Loop")
    parser.add_argument("--episodes", type=int, default=10,
                        help="Number of 90-day episodes to run (default: 10)")
    parser.add_argument("--days", type=int, default=90,
                        help="Days per episode (default: 90)")
    parser.add_argument("--model", type=str, default="Qwen/Qwen2.5-14B-Instruct",
                        help="Model name for vLLM inference")
    parser.add_argument("--northflank-endpoint", type=str, default="",
                        help="Northflank inference endpoint URL")
    parser.add_argument("--northflank-train-endpoint", type=str, default="",
                        help="Northflank training endpoint URL (defaults to inference endpoint)")
    parser.add_argument("--learning-rate", type=float, default=2e-5,
                        help="GRPO learning rate (default: 2e-5)")
    parser.add_argument("--scenarios", type=str, nargs="+", default=None,
                        help="Scenarios to cycle through (default: all 5)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Collect trajectories but skip training")
    parser.add_argument("--output-dir", type=str, default="training_data",
                        help="Directory for trajectory and summary output")
    args = parser.parse_args()

    # Resolve endpoints
    nf_endpoint = args.northflank_endpoint or os.environ.get("NORTHFLANK_INFERENCE_ENDPOINT", "")
    nf_train_endpoint = args.northflank_train_endpoint or os.environ.get("NORTHFLANK_TRAIN_ENDPOINT", "")
    if nf_train_endpoint:
        os.environ["NORTHFLANK_TRAIN_ENDPOINT"] = nf_train_endpoint

    if not nf_endpoint:
        logger.error("Northflank endpoint required. Set NORTHFLANK_INFERENCE_ENDPOINT or --northflank-endpoint")
        sys.exit(1)

    scenarios = args.scenarios or SCENARIOS
    os.makedirs(args.output_dir, exist_ok=True)

    logger.info("=" * 60)
    logger.info("Office OS Training Loop")
    logger.info(f"  Episodes: {args.episodes}")
    logger.info(f"  Days per episode: {args.days}")
    logger.info(f"  Model: {args.model}")
    logger.info(f"  Scenarios: {scenarios}")
    logger.info(f"  Endpoint: {nf_endpoint}")
    logger.info(f"  Dry run: {args.dry_run}")
    logger.info("=" * 60)

    # Create agents — they persist across episodes so LoRA upgrades carry over
    agents = {role: LLMAgent(role=role) for role in AGENT_ROLES}
    vllm_base_url = nf_endpoint.rstrip("/") + "/v1"
    for role, agent in agents.items():
        agent.set_vllm_endpoint(
            base_url=vllm_base_url,
            api_key="dummy",
            model_name=args.model,
        )

    # Collector persists across episodes to accumulate all trajectories
    # but we drain after each episode for training
    collector = TrajectoryCollector()
    trainer = RemoteTrainer(
        collector=collector,
        base_model=args.model,
        train_every_days=999,  # Disable mid-episode training
        northflank_endpoint=nf_endpoint,
        learning_rate=args.learning_rate,
    )

    all_summaries = []

    for ep in range(1, args.episodes + 1):
        scenario = scenarios[(ep - 1) % len(scenarios)]

        # Run full 90-day episode
        summary = run_episode(
            episode=ep,
            scenario=scenario,
            agents=agents,
            collector=collector,
            days=args.days,
        )
        all_summaries.append(summary)

        # Save episode trajectories
        traj_path = os.path.join(args.output_dir, f"trajectories_ep{ep}_{scenario}.jsonl")
        collector.save_jsonl(traj_path)

        # Train after episode (unless dry run)
        if not args.dry_run:
            logger.info(f"\n{'=' * 40}")
            logger.info(f"TRAINING after Episode {ep} ({scenario})")
            logger.info(f"Pending trajectories: {collector.pending_count()}")

            train_results = asyncio.run(trainer.train_all_roles(current_day=ep * args.days))

            for tr in train_results:
                status = tr["status"]
                role = tr["role"]
                if status == "trained":
                    logger.info(f"  {role}: trained (step={tr.get('step', '?')}, trajs={tr.get('trajectories_used', '?')})")
                    # Switch agent to trained LoRA model
                    endpoint = trainer.get_inference_endpoint(role)
                    if endpoint:
                        agents[role].set_vllm_endpoint(
                            base_url=endpoint["base_url"].rstrip("/") + "/v1",
                            api_key="dummy",
                            model_name=endpoint["model_name"],
                        )
                        logger.info(f"    >> {role} switched to LoRA: {endpoint['model_name']}")
                elif tr.get("reason"):
                    logger.info(f"  {role}: {status} ({tr['reason']})")
                else:
                    logger.info(f"  {role}: {status}")

            logger.info(f"{'=' * 40}\n")
        else:
            logger.info(f"[DRY RUN] Skipping training after Episode {ep}")
            # Still drain the batch so next episode starts fresh
            collector.drain_batch()

        # Progress summary
        logger.info(f"Progress: {ep}/{args.episodes} episodes complete")
        logger.info("")

    # Final summary
    logger.info("\n" + "=" * 60)
    logger.info("TRAINING LOOP COMPLETE")
    logger.info("=" * 60)

    summary_path = os.path.join(args.output_dir, "training_loop_summary.json")
    with open(summary_path, "w") as f:
        json.dump({
            "episodes": args.episodes,
            "days_per_episode": args.days,
            "model": args.model,
            "scenarios_used": [s["scenario"] for s in all_summaries],
            "training_stats": trainer.get_training_stats(),
            "episode_summaries": all_summaries,
        }, f, indent=2, default=str)
    logger.info(f"Summary written to {summary_path}")

    # Print comparison table
    logger.info("\nEpisode Results:")
    logger.info(f"{'Ep':>3} | {'Scenario':<12} | {'Revenue':>10} | {'Won':>3} | {'Lost':>4} | {'Features':>8} | {'Content':>7}")
    logger.info("-" * 65)
    for s in all_summaries:
        logger.info(
            f"{s['episode']:>3} | {s['scenario']:<12} | "
            f"${s['total_revenue']:>9,.0f} | {s['deals_won']:>3} | {s['deals_lost']:>4} | "
            f"{s['features_shipped']:>8} | {s['content_published']:>7}"
        )

    # Show reward progression
    logger.info("\nReward Totals by Episode:")
    header = f"{'Ep':>3} | " + " | ".join(f"{r:>8}" for r in AGENT_ROLES)
    logger.info(header)
    logger.info("-" * len(header))
    for s in all_summaries:
        vals = " | ".join(f"{s['reward_totals'][r]:>+8.1f}" for r in AGENT_ROLES)
        logger.info(f"{s['episode']:>3} | {vals}")


if __name__ == "__main__":
    main()
