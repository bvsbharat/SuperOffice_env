#!/usr/bin/env python3
"""
Run the Office OS multi-agent simulation.

This script orchestrates 7 LLM-powered agents (CEO, Dev, Marketing, Sales, Content, HR, Customer)
taking turns in a simulated startup environment. Each agent uses Claude to
decide actions based on their observations.

Usage:
    # Run locally with Ollama (Mac / local GPU — no API key needed):
    ollama pull qwen3.5:0.8b
    python run_agents.py --local --ollama

    # Run locally with a specific Ollama model:
    python run_agents.py --local --ollama qwen3.5:0.8b

    # Run locally with Anthropic API:
    export ANTHROPIC_API_KEY=your-key
    python run_agents.py --local

    # Run locally with AWS Bedrock:
    python run_agents.py --local --bedrock --aws-region us-east-1

    # Run against the environment server:
    python run_agents.py --server http://localhost:8000

    # Use a specific model / run for N days:
    python run_agents.py --local --model claude-haiku-4-5-20251001 --days 30

    # Mine training scenarios from simulation data:
    python run_agents.py --local --mine-scenarios

Environment variables:
    ANTHROPIC_API_KEY: Required for direct Anthropic API (not needed with --ollama)
    AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY: Required for Bedrock
    AWS_REGION: Optional Bedrock region (or use --aws-region)
"""

import argparse
import json
import logging
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load .env file (check current dir and parent)
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

from agents.llm_agent import LLMAgent
from market.config import AGENT_ROLES, EPISODE_DAYS, TURNS_PER_DAY

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def run_local(days: int = EPISODE_DAYS, model: str = "claude-sonnet-4-20250514",
              reflect_every: int = 10, provider: str = "anthropic", aws_region: str = "us-east-1",
              mine_scenarios: bool = False, seed: int | None = None,
              ollama_model: str | None = None, ollama_host: str = "http://localhost:11434"):
    """Run the simulation locally without a server.

    Args:
        ollama_model: If set, use Ollama for local inference (e.g. "qwen3.5:0.8b").
                      Requires Ollama running at ollama_host.
        ollama_host: Ollama server URL (default: http://localhost:11434).
    """
    from server.office_os_environment import OfficeOsEnvironment
    from models import OfficeOsAction
    from training.collector import TrajectoryCollector, ScenarioMiner

    collector = TrajectoryCollector()
    env = OfficeOsEnvironment(seed=seed)
    obs = env.reset()

    # Create LLM agents
    agents = {role: LLMAgent(role=role, model=model, provider=provider, aws_region=aws_region) for role in AGENT_ROLES}

    # Configure Ollama for local inference if requested
    if ollama_model:
        for role, agent in agents.items():
            agent.set_ollama_endpoint(model_name=ollama_model, host=ollama_host)
        logger.info(f"All agents using Ollama: {ollama_model} at {ollama_host}")

    # Convert initial observation to dict for agents
    obs_dict = _obs_to_dict(obs)

    logger.info("=" * 60)
    logger.info("Office OS Simulation Started")
    logger.info(f"Model: {model} | Provider: {provider} | Days: {days} | Agents: {', '.join(AGENT_ROLES)}")
    logger.info(f"Features: adversarial_curriculum=ON | personality_modeling=ON | skill_library=ON | perturbations=ON")
    logger.info("=" * 60)

    turn = 0
    role_index = 0

    while not obs.done and obs.day <= days:
        # Round-robin through agents
        role = AGENT_ROLES[role_index % len(AGENT_ROLES)]
        agent = agents[role]
        role_index += 1
        turn += 1

        # Agent decides action
        logger.info(f"\n--- Day {obs.day} | {obs.phase} | Turn {turn} | {agent.base.name} ---")
        action_dict = agent.decide(obs_dict, turn)
        logger.info(f"  Action: {action_dict['action_type']} -> {action_dict.get('target', '')}")
        logger.info(f"  Reason: {action_dict.get('reasoning', '')}")
        if action_dict.get("message"):
            logger.info(f"  Message: {action_dict['message']}")

        # Execute action
        action = OfficeOsAction(
            agent_id=role,
            action_type=action_dict["action_type"],
            target=action_dict.get("target", ""),
            parameters=action_dict.get("parameters", {}),
            reasoning=action_dict.get("reasoning", ""),
            message=action_dict.get("message"),
        )
        obs = env.step(action)
        obs_dict = _obs_to_dict(obs)

        # Log result
        result = obs.last_action_result
        status = "OK" if result.get("success") else "FAIL"
        logger.info(f"  Result [{status}]: {result.get('detail', '')}")
        logger.info(f"  Reward: {obs.reward}")

        # Track reward in adversarial designer
        if hasattr(env, '_simulator') and hasattr(env._simulator, 'adversarial_designer'):
            env._simulator.adversarial_designer.track_reward(
                role, obs.reward, action_dict.get("action_type", "")
            )

        # Record skill (high reward) or anti-pattern (very negative reward)
        agent.base.record_skill(
            observation=str(obs_dict.get("role_data", "")),
            action_type=action_dict.get("action_type", ""),
            target=action_dict.get("target", ""),
            parameters=action_dict.get("parameters", {}),
            reasoning=action_dict.get("reasoning", ""),
            reward=obs.reward,
            turn=turn,
        )

        # Collect trajectory with decomposed rewards
        reward_breakdown = {}
        if hasattr(obs, 'reward_breakdown'):
            reward_breakdown = obs.reward_breakdown
        collector.record(
            role=role,
            system_prompt=agent.last_system_prompt if hasattr(agent, 'last_system_prompt') else "",
            user_message=str(obs_dict),
            assistant_response=action_dict,
            reward=obs.reward,
            day=obs.day,
            turn=turn,
            reward_breakdown=reward_breakdown,
        )

        # Event-driven reflection: trigger on high/low reward, day boundaries, or periodic
        day_boundary = (turn % TURNS_PER_DAY == 0)
        if day_boundary or turn % (reflect_every * len(AGENT_ROLES)) == 0:
            for r, a in agents.items():
                a.reflect(turn, obs_dict, reward=obs.reward, day_boundary=day_boundary)
                logger.info(f"  [{r}] reflected on recent events")

        # Day summary
        if turn % TURNS_PER_DAY == 0:
            kpis = env._market.get_all_kpis()
            logger.info(f"\n{'='*60}")
            logger.info(f"END OF DAY {obs.day - 1} SUMMARY")
            logger.info(f"  Revenue: ${kpis['revenue']:,.0f} | Total: ${kpis['total_revenue']:,.0f}")
            logger.info(f"  Traffic: {kpis['website_traffic']} | Conv: {env._market.conversion_rate*100:.1f}%")
            logger.info(f"  Pipeline: ${kpis['pipeline_value']:,.0f} | Customers: {kpis['active_customers']}")
            logger.info(f"  Features: {kpis['features_shipped']} | Content: {kpis['content_published']}")
            logger.info(f"  Budget: ${kpis['budget_remaining']:,.0f}")
            # Log adversarial stats
            if hasattr(env, '_simulator') and hasattr(env._simulator, 'adversarial_designer'):
                adv = env._simulator.adversarial_designer.get_stats()
                logger.info(f"  Adversarial difficulty: {adv['difficulty_level']:.2f}")
            logger.info(f"{'='*60}\n")

    # Final summary
    logger.info("\n" + "=" * 60)
    logger.info("SIMULATION COMPLETE")
    logger.info("=" * 60)
    kpis = env._market.get_all_kpis()
    logger.info(f"Total Revenue: ${kpis['total_revenue']:,.0f}")
    logger.info(f"Features Shipped: {kpis['features_shipped']}")
    logger.info(f"Content Published: {kpis['content_published']}")
    logger.info(f"Customers Won: {len([c for c in env._market.customers if c.stage == 'closed_won'])}")
    logger.info(f"Customers Lost: {len([c for c in env._market.customers if c.stage == 'closed_lost'])}")

    # Print agent memories and skill libraries
    for role, agent in agents.items():
        ctx = agent.base.get_context(turn)
        reflections = ctx.get("recent_reflections", [])
        logger.info(f"\n[{agent.base.name}] Final reflections:")
        for r in reflections:
            logger.info(f"  - {r}")
        if "skill_library" in ctx:
            logger.info(f"  Skills learned: {ctx['skill_library']['summary']}")

    # Save trajectories
    data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "training_data")
    collector.save_jsonl(os.path.join(data_dir, "trajectories.jsonl"))

    # Mine scenarios if requested
    if mine_scenarios:
        miner = ScenarioMiner()
        scenarios = miner.mine(collector)
        if scenarios:
            miner.save(os.path.join(data_dir, "mined_scenarios.jsonl"))
            logger.info(f"Mined {len(scenarios)} training scenarios from critical moments")

    return collector


def run_server(server_url: str, days: int = EPISODE_DAYS, model: str = "claude-sonnet-4-20250514",
               provider: str = "anthropic", aws_region: str = "us-east-1"):
    """Run agents against the environment server via WebSocket."""
    from client import OfficeOsEnv
    from models import OfficeOsAction

    agents = {role: LLMAgent(role=role, model=model, provider=provider, aws_region=aws_region) for role in AGENT_ROLES}

    with OfficeOsEnv(base_url=server_url) as client:
        result = client.reset()
        obs = result.observation
        obs_dict = _obs_to_dict(obs)

        logger.info("Connected to Office OS server")
        logger.info(f"Model: {model} | Days: {days}")

        turn = 0
        role_index = 0

        while not obs.done and obs.day <= days:
            role = AGENT_ROLES[role_index % len(AGENT_ROLES)]
            agent = agents[role]
            role_index += 1
            turn += 1

            action_dict = agent.decide(obs_dict, turn)
            logger.info(f"Day {obs.day} | {agent.base.name}: {action_dict['action_type']} -> {action_dict.get('target', '')}")

            action = OfficeOsAction(
                agent_id=role,
                action_type=action_dict["action_type"],
                target=action_dict.get("target", ""),
                parameters=action_dict.get("parameters", {}),
                reasoning=action_dict.get("reasoning", ""),
                message=action_dict.get("message"),
            )
            result = client.step(action)
            obs = result.observation
            obs_dict = _obs_to_dict(obs)

            status = "OK" if obs.last_action_result.get("success") else "FAIL"
            logger.info(f"  [{status}] {obs.last_action_result.get('detail', '')} (reward: {obs.reward})")

    logger.info("Simulation complete.")


def _obs_to_dict(obs) -> dict:
    """Convert an OfficeOsObservation to a plain dict for the agent."""
    return {
        "agent_id": obs.agent_id,
        "day": obs.day,
        "phase": obs.phase,
        "kpis": obs.kpis,
        "budget_remaining": obs.budget_remaining,
        "recent_actions": obs.recent_actions,
        "messages": obs.messages,
        "events": obs.events,
        "role_data": obs.role_data,
        "last_action_result": obs.last_action_result,
        "done": obs.done,
        "reward": obs.reward,
    }


def main():
    parser = argparse.ArgumentParser(description="Run Office OS multi-agent simulation")
    parser.add_argument("--server", type=str, help="Server URL (e.g. http://localhost:8000)")
    parser.add_argument("--local", action="store_true", help="Run locally without server")
    parser.add_argument("--days", type=int, default=EPISODE_DAYS, help=f"Number of days to simulate (default: {EPISODE_DAYS})")
    parser.add_argument("--model", type=str, default="claude-sonnet-4-20250514", help="Claude model to use")
    parser.add_argument("--reflect-every", type=int, default=10, help="Reflect every N turns per agent")
    parser.add_argument("--bedrock", action="store_true", help="Use AWS Bedrock instead of Anthropic API")
    parser.add_argument("--aws-region", type=str, default="us-east-1", help="AWS region for Bedrock (default: us-east-1)")
    # New flags for improvements
    parser.add_argument("--mine-scenarios", action="store_true", help="Mine critical decision points as training scenarios")
    parser.add_argument("--seed", type=int, default=None, help="Random seed for reproducibility")
    # Mac-local inference with Ollama
    parser.add_argument("--ollama", type=str, nargs="?", const="qwen3.5:0.8b", default=None,
                        metavar="MODEL", help="Use Ollama for local inference (default model: qwen3.5:0.8b). Requires Ollama running locally.")
    parser.add_argument("--ollama-host", type=str, default="http://localhost:11434",
                        help="Ollama server URL (default: http://localhost:11434)")
    args = parser.parse_args()

    if not args.server and not args.local:
        parser.error("Must specify --server URL or --local")

    provider = "bedrock" if args.bedrock else "anthropic"

    # Auto-detect: if CLAUDE_CODE_USE_BEDROCK is set, default to bedrock
    if not args.bedrock and os.environ.get("CLAUDE_CODE_USE_BEDROCK"):
        provider = "bedrock"
        logger.info("Auto-detected CLAUDE_CODE_USE_BEDROCK, using Bedrock provider")

    # Skip API key checks when using Ollama (local inference)
    if args.ollama:
        logger.info(f"Using Ollama for local inference: {args.ollama}")
    elif provider == "anthropic" and not os.environ.get("ANTHROPIC_API_KEY"):
        logger.error("ANTHROPIC_API_KEY environment variable not set")
        logger.error("Set it with: export ANTHROPIC_API_KEY=your-key-here")
        logger.error("Or use --bedrock for AWS Bedrock (uses AWS credentials)")
        logger.error("Or use --ollama for local inference with Ollama")
        sys.exit(1)

    if provider == "bedrock":
        has_keys = os.environ.get("AWS_ACCESS_KEY_ID") and os.environ.get("AWS_SECRET_ACCESS_KEY")
        has_token = os.environ.get("AWS_BEARER_TOKEN_BEDROCK")
        if not has_keys and not has_token:
            logger.error("AWS credentials not found. Set AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY")
            logger.error("Or set AWS_BEARER_TOKEN_BEDROCK for bearer token auth")
            sys.exit(1)
        # Auto-convert Anthropic model IDs to Bedrock format
        if not args.model.startswith("us.") and not args.model.startswith("anthropic."):
            args.model = f"us.anthropic.{args.model}-v1:0"
        logger.info(f"Using AWS Bedrock (region: {args.aws_region})")

    if args.local:
        run_local(days=args.days, model=args.model, reflect_every=args.reflect_every,
                  provider=provider, aws_region=args.aws_region,
                  mine_scenarios=args.mine_scenarios, seed=args.seed,
                  ollama_model=args.ollama, ollama_host=args.ollama_host)
    else:
        run_server(server_url=args.server, days=args.days, model=args.model,
                   provider=provider, aws_region=args.aws_region)


if __name__ == "__main__":
    main()
