#!/usr/bin/env python3
"""
Run the MarketVille multi-agent simulation.

This script orchestrates 4 LLM-powered agents (Dev, Marketing, Sales, Content)
taking turns in a simulated startup environment. Each agent uses Claude to
decide actions based on their observations.

Usage:
    # Run against the environment server (must be running):
    python run_agents.py --server http://localhost:8000

    # Run locally (no server needed):
    python run_agents.py --local

    # Run for N days:
    python run_agents.py --local --days 30

    # Use a specific model:
    python run_agents.py --local --model claude-haiku-4-5-20251001

Environment variables:
    ANTHROPIC_API_KEY: Required for LLM-powered agents
"""

import argparse
import json
import logging
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from agents.llm_agent import LLMAgent
from market.config import AGENT_ROLES, TURNS_PER_DAY

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def run_local(days: int = 90, model: str = "claude-sonnet-4-20250514", reflect_every: int = 10):
    """Run the simulation locally without a server."""
    from server.office_os_environment import OfficeOsEnvironment
    from models import OfficeOsAction

    env = OfficeOsEnvironment()
    obs = env.reset()

    # Create LLM agents
    agents = {role: LLMAgent(role=role, model=model) for role in AGENT_ROLES}

    # Convert initial observation to dict for agents
    obs_dict = _obs_to_dict(obs)

    logger.info("=" * 60)
    logger.info("MarketVille Simulation Started")
    logger.info(f"Model: {model} | Days: {days} | Agents: {', '.join(AGENT_ROLES)}")
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

        # Periodic reflection (every N turns per agent)
        if turn % (reflect_every * len(AGENT_ROLES)) == 0:
            for r, a in agents.items():
                a.reflect(turn, obs_dict)
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

    # Print agent memories
    for role, agent in agents.items():
        ctx = agent.base.get_context(turn)
        reflections = ctx.get("recent_reflections", [])
        logger.info(f"\n[{agent.base.name}] Final reflections:")
        for r in reflections:
            logger.info(f"  - {r}")


def run_server(server_url: str, days: int = 90, model: str = "claude-sonnet-4-20250514"):
    """Run agents against the environment server via WebSocket."""
    from client import OfficeOsEnv
    from models import OfficeOsAction

    agents = {role: LLMAgent(role=role, model=model) for role in AGENT_ROLES}

    with OfficeOsEnv(base_url=server_url) as client:
        result = client.reset()
        obs = result.observation
        obs_dict = _obs_to_dict(obs)

        logger.info("Connected to MarketVille server")
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
    parser = argparse.ArgumentParser(description="Run MarketVille multi-agent simulation")
    parser.add_argument("--server", type=str, help="Server URL (e.g. http://localhost:8000)")
    parser.add_argument("--local", action="store_true", help="Run locally without server")
    parser.add_argument("--days", type=int, default=90, help="Number of days to simulate (default: 90)")
    parser.add_argument("--model", type=str, default="claude-sonnet-4-20250514", help="Claude model to use")
    parser.add_argument("--reflect-every", type=int, default=10, help="Reflect every N turns per agent")
    args = parser.parse_args()

    if not args.server and not args.local:
        parser.error("Must specify --server URL or --local")

    if not os.environ.get("ANTHROPIC_API_KEY"):
        logger.error("ANTHROPIC_API_KEY environment variable not set")
        logger.error("Set it with: export ANTHROPIC_API_KEY=your-key-here")
        sys.exit(1)

    if args.local:
        run_local(days=args.days, model=args.model, reflect_every=args.reflect_every)
    else:
        run_server(server_url=args.server, days=args.days, model=args.model)


if __name__ == "__main__":
    main()
