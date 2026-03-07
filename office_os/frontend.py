#!/usr/bin/env python3
"""
Office OS Terminal Dashboard.

A rich-based live terminal UI that visualizes the multi-agent simulation
in real-time. Shows KPIs, customer pipeline, agent actions, and messages.

Usage:
    # Run with Bedrock (auto-detected from .env):
    python frontend.py --days 10

    # Run with Anthropic API:
    python frontend.py --days 10 --model claude-haiku-4-5-20251001

    # Run with explicit Bedrock:
    python frontend.py --days 10 --bedrock --aws-region us-east-1
"""

import argparse
import logging
import os
import sys
import time

# Log LLM errors to file so they're visible even when rich Live swallows stderr
logging.basicConfig(
    filename="office_os_debug.log",
    level=logging.WARNING,
    format="%(asctime)s %(name)s %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load .env (check current dir and parent)
def _load_env():
    for d in [os.path.dirname(os.path.abspath(__file__)),
              os.path.dirname(os.path.dirname(os.path.abspath(__file__)))]:
        env_path = os.path.join(d, ".env")
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, _, value = line.partition("=")
                        os.environ.setdefault(key.strip(), value.strip())
_load_env()

from rich.console import Console
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich.columns import Columns

from agents.llm_agent import LLMAgent
from market.config import AGENT_ROLES, CONTRACT_TIERS, TURNS_PER_DAY
from server.office_os_environment import OfficeOsEnvironment
from models import OfficeOsAction

console = Console()

# Colors per agent role
ROLE_COLORS = {
    "dev": "cyan",
    "marketing": "magenta",
    "sales": "green",
    "content": "yellow",
}
ROLE_NAMES = {
    "dev": "Alex (Dev)",
    "marketing": "Jordan (Mktg)",
    "sales": "Sam (Sales)",
    "content": "Casey (Content)",
}

STAGE_COLORS = {
    "visitor": "dim",
    "lead": "white",
    "qualified": "cyan",
    "demo": "blue",
    "proposal": "yellow",
    "negotiation": "bright_yellow",
    "closed_won": "bold green",
    "closed_lost": "bold red",
    "churned": "dim red",
}


def build_header(market, turn):
    """Top banner with day/phase/turn."""
    day = market.day
    phase = market.phase.replace("_", " ").title()
    text = Text()
    text.append("OFFICE OS", style="bold white")
    text.append(f"  Day {day}/90", style="bright_white")
    text.append(f"  |  {phase}", style="bright_cyan")
    text.append(f"  |  Turn {turn}", style="dim")
    return Panel(text, style="blue", height=3)


def build_kpi_table(market):
    """KPI dashboard panel."""
    kpis = market.get_all_kpis()
    table = Table(show_header=False, box=None, padding=(0, 1))
    table.add_column("Metric", style="dim", width=18)
    table.add_column("Value", justify="right", width=14)

    table.add_row("Revenue (month)", f"[green]${kpis['revenue']:,.0f}[/]")
    table.add_row("Total Revenue", f"[bold green]${kpis['total_revenue']:,.0f}[/]")
    table.add_row("Website Traffic", f"{kpis['website_traffic']:,}")
    table.add_row("Conversion", f"{market.conversion_rate*100:.1f}%")
    table.add_row("Brand Awareness", f"{market.brand_awareness:.0f}/100")
    table.add_row("Budget", f"[{'red' if market.budget_remaining < 2000 else 'yellow'}]${market.budget_remaining:,.0f}[/]")
    table.add_row("Pipeline Value", f"[cyan]${kpis['pipeline_value']:,.0f}[/]")
    table.add_row("Features Shipped", f"{kpis['features_shipped']}")
    table.add_row("Content Published", f"{kpis['content_published']}")
    table.add_row("Active Campaigns", f"{kpis['active_campaigns']}")
    table.add_row("Stability", f"{'[green]' if market.product_stability > 0.7 else '[red]'}{market.product_stability:.0%}[/]")

    return Panel(table, title="[bold]KPIs[/]", border_style="green", height=15)


def build_pipeline_table(market):
    """Customer pipeline panel."""
    table = Table(box=None, padding=(0, 1), show_header=True)
    table.add_column("Customer", width=16)
    table.add_column("Stage", width=12)
    table.add_column("Budget", justify="right", width=10)
    table.add_column("Contract", width=8)

    customers = sorted(market.customers, key=lambda c: [
        "visitor", "lead", "qualified", "demo", "proposal",
        "negotiation", "closed_won", "closed_lost", "churned"
    ].index(c.stage) if c.stage in [
        "visitor", "lead", "qualified", "demo", "proposal",
        "negotiation", "closed_won", "closed_lost", "churned"
    ] else 99)

    for c in customers[-12:]:  # Show last 12
        color = STAGE_COLORS.get(c.stage, "white")
        tier_label = ""
        if c.contract_tier:
            tier_label = CONTRACT_TIERS.get(c.contract_tier, {}).get("label", "")
        table.add_row(
            c.name[:16],
            f"[{color}]{c.stage}[/]",
            f"${c.budget:,.0f}",
            tier_label,
        )

    if not market.customers:
        table.add_row("[dim]No customers yet[/]", "", "", "")

    return Panel(table, title="[bold]Customer Pipeline[/]", border_style="cyan", height=15)


def build_activity_panel(action_log):
    """Recent agent actions panel."""
    lines = []
    for entry in action_log[-8:]:
        role = entry["role"]
        color = ROLE_COLORS.get(role, "white")
        name = ROLE_NAMES.get(role, role)
        status = "[green]OK[/]" if entry["success"] else "[red]FAIL[/]"
        lines.append(
            f"[{color}]{name}[/] {status} "
            f"[bold]{entry['action']}[/] -> {entry['target'][:20]}"
        )
        if entry.get("detail"):
            lines.append(f"  [dim]{entry['detail'][:60]}[/]")
        if entry.get("reasoning"):
            lines.append(f"  [italic dim]\"{entry['reasoning'][:55]}\"[/]")

    content = "\n".join(lines) if lines else "[dim]No actions yet...[/]"
    return Panel(content, title="[bold]Agent Activity[/]", border_style="yellow", height=12)


def build_messages_panel(message_log):
    """Inter-agent messages panel."""
    lines = []
    for msg in message_log[-6:]:
        from_color = ROLE_COLORS.get(msg["from"], "white")
        lines.append(
            f"[{from_color}]{msg['from']}[/] -> [bold]{msg['to']}[/]: {msg['content'][:50]}"
        )

    content = "\n".join(lines) if lines else "[dim]No messages yet...[/]"
    return Panel(content, title="[bold]Agent Messages[/]", border_style="magenta", height=6)


def build_features_panel(market):
    """Features and content summary."""
    lines = []

    # In-progress features
    in_progress = [f for f in market.features if not f.shipped]
    shipped = [f for f in market.features if f.shipped]

    if in_progress:
        lines.append("[bold]Building:[/]")
        for f in in_progress[:3]:
            bar_len = max(0, 5 - f.turns_remaining)
            bar = "[cyan]" + "#" * bar_len + "[/]" + "." * f.turns_remaining
            lines.append(f"  {f.name[:18]} {bar}")

    if shipped:
        lines.append("[bold]Shipped:[/]")
        for f in shipped[:4]:
            lines.append(f"  [green]{f.name}[/]")

    content_count = len([p for p in market.content_pieces if p.published])
    if content_count:
        lines.append(f"\n[bold]Content:[/] {content_count} pieces published")

    content = "\n".join(lines) if lines else "[dim]No features yet...[/]"
    return Panel(content, title="[bold]Product & Content[/]", border_style="bright_blue", height=12)


def build_rewards_panel(reward_totals):
    """Cumulative rewards per agent."""
    table = Table(box=None, show_header=False, padding=(0, 1))
    table.add_column("Agent", width=16)
    table.add_column("Reward", justify="right", width=10)

    for role in AGENT_ROLES:
        color = ROLE_COLORS[role]
        name = ROLE_NAMES[role]
        total = reward_totals.get(role, 0.0)
        table.add_row(f"[{color}]{name}[/]", f"[bold]{total:+.1f}[/]")

    return Panel(table, title="[bold]Rewards[/]", border_style="bright_white", height=8)


def build_events_panel(market):
    """Active market events."""
    lines = []
    for e in market.active_events[-4:]:
        lines.append(f"[bold red]{e.get('name', '?')}[/]: {e.get('description', '')[:45]}")

    content = "\n".join(lines) if lines else "[dim]No active events[/]"
    return Panel(content, title="[bold]Market Events[/]", border_style="red", height=6)


def build_layout(market, turn, action_log, message_log, reward_totals):
    """Assemble the full dashboard layout."""
    layout = Layout()

    layout.split_column(
        Layout(name="header", size=3),
        Layout(name="top", size=15),
        Layout(name="middle", size=12),
        Layout(name="bottom", size=8),
    )

    layout["header"].update(build_header(market, turn))

    layout["top"].split_row(
        Layout(name="kpis", ratio=1),
        Layout(name="pipeline", ratio=1),
        Layout(name="features", ratio=1),
    )
    layout["top"]["kpis"].update(build_kpi_table(market))
    layout["top"]["pipeline"].update(build_pipeline_table(market))
    layout["top"]["features"].update(build_features_panel(market))

    layout["middle"].split_row(
        Layout(name="activity", ratio=2),
        Layout(name="rewards", ratio=1),
    )
    layout["middle"]["activity"].update(build_activity_panel(action_log))
    layout["middle"]["rewards"].update(build_rewards_panel(reward_totals))

    layout["bottom"].split_row(
        Layout(name="messages", ratio=1),
        Layout(name="events", ratio=1),
    )
    layout["bottom"]["messages"].update(build_messages_panel(message_log))
    layout["bottom"]["events"].update(build_events_panel(market))

    return layout


def run_dashboard(days: int = 90, model: str = "claude-sonnet-4-20250514",
                  provider: str = "anthropic", aws_region: str = "us-east-1",
                  speed: float = 0.5):
    """Run the simulation with a live terminal dashboard."""
    env = OfficeOsEnvironment()
    obs = env.reset()

    logger.info(f"Creating agents: model={model}, provider={provider}, region={aws_region}")
    agents = {role: LLMAgent(role=role, model=model, provider=provider, aws_region=aws_region)
              for role in AGENT_ROLES}

    action_log = []
    message_log = []
    reward_totals = {role: 0.0 for role in AGENT_ROLES}

    turn = 0
    role_index = 0

    with Live(build_layout(env._market, turn, action_log, message_log, reward_totals),
              console=console, refresh_per_second=4, screen=True) as live:
        while not obs.done and obs.day <= days:
            role = AGENT_ROLES[role_index % len(AGENT_ROLES)]
            agent = agents[role]
            role_index += 1
            turn += 1

            # Convert obs for agent
            obs_dict = {
                "agent_id": obs.agent_id, "day": obs.day, "phase": obs.phase,
                "kpis": obs.kpis, "budget_remaining": obs.budget_remaining,
                "recent_actions": obs.recent_actions, "messages": obs.messages,
                "events": obs.events, "role_data": obs.role_data,
                "last_action_result": obs.last_action_result,
                "done": obs.done, "reward": obs.reward,
            }

            # Agent decides
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

            # Track results
            result = obs.last_action_result
            action_log.append({
                "role": role,
                "action": action_dict["action_type"],
                "target": action_dict.get("target", ""),
                "reasoning": action_dict.get("reasoning", ""),
                "success": result.get("success", False),
                "detail": result.get("detail", ""),
            })

            # Track messages
            if action_dict.get("message") and ":" in action_dict["message"]:
                to_agent = action_dict["message"].split(":")[0].strip()
                msg_content = ":".join(action_dict["message"].split(":")[1:]).strip()
                message_log.append({"from": role, "to": to_agent, "content": msg_content})

            # Track rewards
            reward_totals[role] += obs.reward

            # Periodic reflection
            if turn % (10 * len(AGENT_ROLES)) == 0:
                for r, a in agents.items():
                    a.reflect(turn, obs_dict)

            # Update display
            live.update(build_layout(env._market, turn, action_log, message_log, reward_totals))
            time.sleep(speed)

    # Final screen
    console.clear()
    console.print("\n")
    console.print(Panel(
        build_final_summary(env._market, reward_totals, agents, turn),
        title="[bold]SIMULATION COMPLETE[/]",
        border_style="bold green",
    ))


def build_final_summary(market, reward_totals, agents, turn):
    """Build the final summary text."""
    kpis = market.get_all_kpis()
    won = [c for c in market.customers if c.stage == "closed_won"]
    lost = [c for c in market.customers if c.stage == "closed_lost"]

    lines = [
        f"[bold]Total Revenue:[/] [green]${kpis['total_revenue']:,.0f}[/]",
        f"[bold]Features Shipped:[/] {kpis['features_shipped']}",
        f"[bold]Content Published:[/] {kpis['content_published']}",
        f"[bold]Deals Won:[/] [green]{len(won)}[/]  |  [bold]Deals Lost:[/] [red]{len(lost)}[/]",
        f"[bold]Final Budget:[/] ${kpis['budget_remaining']:,.0f}",
        "",
        "[bold]Agent Rewards:[/]",
    ]
    for role in AGENT_ROLES:
        color = ROLE_COLORS[role]
        name = ROLE_NAMES[role]
        lines.append(f"  [{color}]{name}[/]: {reward_totals[role]:+.1f}")

    # Closed deals
    if won:
        lines.append("")
        lines.append("[bold]Closed Deals:[/]")
        for c in won:
            tier = CONTRACT_TIERS.get(c.contract_tier, {}).get("label", "")
            lines.append(f"  [green]{c.name}[/] - ${c.budget:,.0f} ({tier})")

    # Agent reflections
    lines.append("")
    lines.append("[bold]Agent Final Thoughts:[/]")
    for role, agent in agents.items():
        ctx = agent.base.get_context(turn)
        reflections = ctx.get("recent_reflections", [])
        color = ROLE_COLORS[role]
        name = ROLE_NAMES[role]
        if reflections:
            lines.append(f"  [{color}]{name}[/]: {reflections[0][:70]}")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Office OS Terminal Dashboard")
    parser.add_argument("--days", type=int, default=90, help="Days to simulate (default: 90)")
    parser.add_argument("--model", type=str, default="claude-sonnet-4-20250514", help="Claude model")
    parser.add_argument("--bedrock", action="store_true", help="Use AWS Bedrock")
    parser.add_argument("--aws-region", type=str, default="us-east-1", help="AWS region")
    parser.add_argument("--speed", type=float, default=0.5, help="Seconds between turns (default: 0.5)")
    args = parser.parse_args()

    provider = "bedrock" if args.bedrock else "anthropic"
    if not args.bedrock and os.environ.get("CLAUDE_CODE_USE_BEDROCK"):
        provider = "bedrock"

    if provider == "anthropic" and not os.environ.get("ANTHROPIC_API_KEY"):
        console.print("[red]ANTHROPIC_API_KEY not set. Use --bedrock or set the key.[/]")
        sys.exit(1)

    if provider == "bedrock":
        has_creds = os.environ.get("AWS_ACCESS_KEY_ID") or os.environ.get("AWS_BEARER_TOKEN_BEDROCK")
        if not has_creds:
            console.print("[red]AWS credentials not found for Bedrock.[/]")
            sys.exit(1)
        # Auto-convert Anthropic model IDs to Bedrock format
        if not args.model.startswith("us.") and not args.model.startswith("anthropic."):
            args.model = f"us.anthropic.{args.model}-v1:0"
        console.print(f"[dim]Using Bedrock ({args.aws_region})[/]")

    console.print(f"[bold]Office OS Dashboard[/] | Model: {args.model} | Days: {args.days}")
    console.print("[dim]Starting simulation...[/]\n")
    time.sleep(1)

    run_dashboard(
        days=args.days,
        model=args.model,
        provider=provider,
        aws_region=args.aws_region,
        speed=args.speed,
    )


if __name__ == "__main__":
    main()
