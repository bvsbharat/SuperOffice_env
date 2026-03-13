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

# Suppress noisy HTTP request logs from httpx/httpcore
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

from agents.llm_agent import LLMAgent
from market.config import AGENT_ROLES, TURNS_PER_DAY
from server.office_os_environment import OfficeOsEnvironment
from models import OfficeOsAction
from market.config import EPISODE_DAYS
from training.collector import TrajectoryCollector, ScenarioMiner
from training.trainer import RemoteTrainer

# Ordered by difficulty for curriculum learning (easiest first)
SCENARIOS_BY_DIFFICULTY = ["baseline", "competitor", "series_a", "churn", "viral"]


def run_episode(
    episode: int,
    scenario: str,
    agents: dict[str, LLMAgent],
    collector: TrajectoryCollector,
    trainer: RemoteTrainer | None = None,
    days: int = EPISODE_DAYS,
    dry_run: bool = False,
    use_claude: bool = False,
) -> dict:
    """Run a single episode and collect trajectories.

    Supports mid-episode sliding-window training: if trainer is provided
    and not in dry-run mode, it checks every day whether enough trajectories
    have accumulated and triggers training mid-episode.

    Returns summary dict.
    """
    env = OfficeOsEnvironment(scenario=scenario)
    obs = env.reset()

    reward_totals = {role: 0.0 for role in AGENT_ROLES}
    day_rewards = {role: 0.0 for role in AGENT_ROLES}
    turn = 0
    role_index = 0
    mid_episode_trains = 0

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

        # Extract decomposed reward breakdown from observation metadata
        reward_breakdown = obs.metadata.get("reward_breakdown", {}) if obs.metadata else {}

        # Record trajectory with full reward breakdown
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
            reward_breakdown=reward_breakdown,
        )

        reward_totals[role] += obs.reward
        day_rewards[role] += obs.reward

        # Day boundary: logging + sliding-window training check
        if turn % TURNS_PER_DAY == 0:
            kpis = env._market.get_all_kpis()
            day_reward_str = " ".join(f"{r[:3]}={v:+.1f}" for r, v in day_rewards.items())
            logger.info(
                f"  [Ep{episode}] Day {obs.day - 1} | "
                f"Rev=${kpis['total_revenue']:,.0f} | "
                f"Pipeline=${kpis['pipeline_value']:,.0f} | "
                f"Features={kpis['features_shipped']} | "
                f"Content={kpis['content_published']} | "
                f"Rewards: {day_reward_str}"
            )
            day_rewards = {role: 0.0 for role in AGENT_ROLES}

            # --- Sliding-window mid-episode training ---
            if trainer and not dry_run and not use_claude and trainer.should_train(obs.day):
                logger.info(f"  >> Mid-episode training triggered at day {obs.day}")
                train_results = asyncio.run(trainer.train_all_roles(current_day=obs.day))
                trained = [r for r in train_results if r["status"] == "trained"]
                if trained:
                    mid_episode_trains += 1
                    for tr in trained:
                        endpoint = trainer.get_inference_endpoint(tr["role"])
                        if endpoint:
                            agents[tr["role"]].set_vllm_endpoint(
                                base_url=endpoint["base_url"].rstrip("/") + "/v1",
                                api_key="dummy",
                                model_name=endpoint["model_name"],
                            )
                    logger.info(f"  >> Trained {len(trained)} roles mid-episode")

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
        "mid_episode_trains": mid_episode_trains,
    }

    logger.info(f"Episode {episode} complete: scenario={scenario}")
    logger.info(f"  Revenue=${kpis['total_revenue']:,.0f} | Won={won} Lost={lost}")
    logger.info(f"  Rewards: {', '.join(f'{r}={v:+.1f}' for r, v in reward_totals.items())}")
    logger.info(f"  Trajectories pending: {collector.pending_count()}")
    if mid_episode_trains:
        logger.info(f"  Mid-episode training rounds: {mid_episode_trains}")

    return summary


def main():
    parser = argparse.ArgumentParser(description="Office OS Training Loop")
    parser.add_argument("--episodes", type=int, default=10,
                        help="Number of 90-day episodes to run (default: 10)")
    parser.add_argument("--days", type=int, default=EPISODE_DAYS,
                        help=f"Days per episode (default: {EPISODE_DAYS})")
    parser.add_argument("--model", type=str, default="Qwen/Qwen3.5-0.8B",
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
    parser.add_argument("--use-claude", action="store_true",
                        help="Use Claude for data collection (distillation mode). "
                             "Collects high-quality trajectories to train Qwen on.")
    parser.add_argument("--provider", type=str, default="bedrock",
                        choices=["anthropic", "bedrock"],
                        help="Claude provider: 'anthropic' (direct API) or 'bedrock' (AWS)")
    parser.add_argument("--aws-region", type=str, default="us-east-1",
                        help="AWS region for Bedrock (default: us-east-1)")
    parser.add_argument("--claude-model", type=str, default="claude-sonnet-4-20250514",
                        help="Claude model for distillation (default: claude-sonnet-4-20250514)")
    parser.add_argument("--output-dir", type=str, default="training_data",
                        help="Directory for trajectory and summary output")
    args = parser.parse_args()

    # Resolve endpoints
    nf_endpoint = args.northflank_endpoint or os.environ.get("NORTHFLANK_INFERENCE_ENDPOINT", "")
    nf_train_endpoint = args.northflank_train_endpoint or os.environ.get("NORTHFLANK_TRAIN_ENDPOINT", "")
    if nf_train_endpoint:
        os.environ["NORTHFLANK_TRAIN_ENDPOINT"] = nf_train_endpoint

    if not args.use_claude and not nf_endpoint:
        logger.error("Either --use-claude or --northflank-endpoint required")
        sys.exit(1)

    scenarios = args.scenarios or SCENARIOS_BY_DIFFICULTY
    os.makedirs(args.output_dir, exist_ok=True)

    mode = "Claude (distillation)" if args.use_claude else f"vLLM ({args.model})"
    logger.info("=" * 60)
    logger.info("Office OS Training Loop")
    logger.info(f"  Episodes: {args.episodes}")
    logger.info(f"  Days per episode: {args.days}")
    logger.info(f"  Mode: {mode}")
    logger.info(f"  Scenarios: {scenarios}")
    logger.info(f"  Endpoint: {nf_endpoint or 'N/A (Claude mode)'}")
    logger.info(f"  Dry run: {args.dry_run}")
    logger.info("=" * 60)

    # Create agents — they persist across episodes so LoRA upgrades carry over
    agents = {
        role: LLMAgent(
            role=role,
            model=args.claude_model if args.use_claude else "claude-sonnet-4-20250514",
            provider=args.provider if args.use_claude else "anthropic",
            aws_region=args.aws_region,
        )
        for role in AGENT_ROLES
    }

    if not args.use_claude and nf_endpoint:
        # Point agents at vLLM for inference
        vllm_base_url = nf_endpoint.rstrip("/") + "/v1"
        for role, agent in agents.items():
            agent.set_vllm_endpoint(
                base_url=vllm_base_url,
                api_key="dummy",
                model_name=args.model,
            )
    else:
        # Claude mode: agents use Claude API (direct or Bedrock)
        logger.info(f"Using Claude via {args.provider} for data collection (distillation mode)")

    # Collector persists across episodes to accumulate all trajectories
    # but we drain after each episode for training
    collector = TrajectoryCollector()
    trainer = RemoteTrainer(
        collector=collector,
        base_model=args.model,
        train_every_days=15,  # Sliding window: train every 15 sim days
        northflank_endpoint=nf_endpoint,
        learning_rate=args.learning_rate,
    )

    # ScenarioMiner for extracting critical decision points
    miner = ScenarioMiner(spike_threshold=5.0, crash_threshold=-3.0, window_size=3)

    # Curriculum learning state: start at easiest scenario, advance on success
    CURRICULUM_REVENUE_THRESHOLD = 20000.0  # Revenue to "pass" a difficulty level
    curriculum_level = 0  # Index into scenarios list (0 = easiest)
    all_summaries = []

    for ep in range(1, args.episodes + 1):
        # --- Curriculum learning: pick scenario based on performance ---
        if args.scenarios:
            # User specified scenarios — cycle through them
            scenario = scenarios[(ep - 1) % len(scenarios)]
        else:
            # Auto-curriculum: use current difficulty level
            scenario = scenarios[min(curriculum_level, len(scenarios) - 1)]

        # Run full episode with mid-episode sliding-window training
        summary = run_episode(
            episode=ep,
            scenario=scenario,
            agents=agents,
            collector=collector,
            trainer=trainer if not args.dry_run and not (args.use_claude and not nf_endpoint) else None,
            days=args.days,
            dry_run=args.dry_run,
            use_claude=args.use_claude,
        )
        all_summaries.append(summary)

        # Save episode trajectories
        traj_path = os.path.join(args.output_dir, f"trajectories_ep{ep}_{scenario}.jsonl")
        collector.save_jsonl(traj_path)

        # --- Mine critical scenarios for focused training data ---
        mined = miner.mine(collector)
        if mined:
            mined_path = os.path.join(args.output_dir, f"mined_scenarios_ep{ep}.jsonl")
            miner.save(mined_path)
            logger.info(f"  Mined {len(mined)} critical scenarios -> {mined_path}")

        # --- Curriculum advancement ---
        if not args.scenarios:
            ep_revenue = summary.get("total_revenue", 0)
            if ep_revenue >= CURRICULUM_REVENUE_THRESHOLD and curriculum_level < len(scenarios) - 1:
                curriculum_level += 1
                logger.info(
                    f"  CURRICULUM: Revenue ${ep_revenue:,.0f} >= ${CURRICULUM_REVENUE_THRESHOLD:,.0f} "
                    f"-> advancing to level {curriculum_level} ({scenarios[min(curriculum_level, len(scenarios) - 1)]})"
                )
            elif ep_revenue < CURRICULUM_REVENUE_THRESHOLD:
                logger.info(
                    f"  CURRICULUM: Revenue ${ep_revenue:,.0f} < ${CURRICULUM_REVENUE_THRESHOLD:,.0f} "
                    f"-> staying at level {curriculum_level} ({scenario})"
                )

        # Train after episode (remaining trajectories from sliding window)
        if args.use_claude and not nf_endpoint:
            # Claude distillation: collect only, no training endpoint available
            logger.info(f"[DISTILL] Episode {ep} collected {collector.pending_count()} Claude trajectories")
            collector.drain_batch()
        elif not args.dry_run:
            pending = collector.pending_count()
            if pending > 0:
                logger.info(f"\n{'=' * 40}")
                logger.info(f"END-OF-EPISODE TRAINING after Episode {ep} ({scenario})")
                logger.info(f"Pending trajectories: {pending}")

                train_results = asyncio.run(trainer.train_all_roles(current_day=ep * args.days))

                for tr in train_results:
                    status = tr["status"]
                    role = tr["role"]
                    if status == "trained":
                        logger.info(f"  {role}: trained (step={tr.get('step', '?')}, trajs={tr.get('trajectories_used', '?')})")
                        # Switch agent to trained LoRA model (only in vLLM mode)
                        if not args.use_claude:
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
                logger.info(f"  No remaining trajectories after mid-episode training")
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
            "curriculum_level_reached": curriculum_level,
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
