---
title: Office Os Environment Server
emoji: 🥈
colorFrom: blue
colorTo: gray
sdk: docker
pinned: false
app_port: 8000
base_path: /web
tags:
  - openenv
---

# Office OS — Multi-Agent Startup Simulation

A Smallville-style multi-agent simulation where 4 AI agents (Dev, Marketing, Sales, Content Creator) autonomously collaborate to grow a SaaS startup over 90 simulated days. Built on Meta's [OpenEnv](https://github.com/meta-pytorch/openenv) framework.

## Run the Simulation

```bash
export ANTHROPIC_API_KEY=your-key
python run_agents.py --local --days 10 --model claude-haiku-4-5-20251001
```

Options:
- `--local` — run directly without a server
- `--server http://localhost:8000` — run against the OpenEnv server
- `--days N` — number of simulated days (default: 90)
- `--model MODEL` — Claude model to use (default: claude-sonnet-4-20250514)
- `--reflect-every N` — agent reflection frequency in turns (default: 10)

## How It Works

4 LLM-powered agents take turns operating a startup:

| Agent | Role | Key Actions |
|-------|------|-------------|
| Alex (Dev) | Build product | BUILD_FEATURE, FIX_BUG, SHIP_RELEASE |
| Jordan (Marketing) | Drive growth | LAUNCH_CAMPAIGN, RUN_AD, OPTIMIZE_FUNNEL |
| Sam (Sales) | Close deals | QUALIFY_LEAD, RUN_DEMO, CLOSE_DEAL |
| Casey (Content) | Create content | WRITE_BLOG, WRITE_CASE_STUDY, WRITE_SOCIAL_POST |

Customers flow through a pipeline: `visitor → lead → qualified → demo → proposal → negotiation → closed_won`

Deals can be closed with contract tiers: **monthly** (1x reward), **6-month** (2x), **annual** (3x).

Each agent has a Smallville-style memory stream (observations, reflections, plans) and receives asymmetric observations scoped to their role.

### Real-World Integration

Enable Google Sheets sync to watch the simulation live in a spreadsheet — see [Sheets Setup](integrations/SHEETS_SETUP.md).

## Quick Start (Client API)

Connect to a running Office OS server:

```python
from office_os import OfficeOsAction, OfficeOsEnv

with OfficeOsEnv(base_url="http://localhost:8000") as env:
    result = env.reset()
    print(f"Day {result.observation.day}, Budget: ${result.observation.budget_remaining}")

    result = env.step(OfficeOsAction(
        agent_id="dev",
        action_type="BUILD_FEATURE",
        target="SSO Integration",
    ))
    print(f"Result: {result.observation.last_action_result['detail']}")
```

## Building & Running the Server

```bash
# Docker
docker build -t office_os-env:latest -f server/Dockerfile .

# Or run locally
uvicorn server.app:app --reload
```

## Deploying to Hugging Face Spaces

```bash
openenv push                          # Push to your namespace
openenv push --repo-id my-org/my-env  # Push to specific repo
openenv push --private                # Deploy as private
```

## Environment Details

### Action (OfficeOsAction)
- `agent_id` — which agent: dev, marketing, sales, content
- `action_type` — e.g. BUILD_FEATURE, LAUNCH_CAMPAIGN, CLOSE_DEAL, WRITE_BLOG
- `target` — what the action applies to (feature name, customer name, etc.)
- `parameters` — action-specific params (e.g. `{"contract_tier": "annual"}`)
- `reasoning` — agent's reasoning for the action
- `message` — optional message to another agent (`"dev: please build SSO"`)

### Observation (OfficeOsObservation)
- `day`, `phase` — simulation time (1-90 days, 4 phases per day)
- `kpis` — role-scoped KPI metrics (Marketing sees all, others see role-relevant subset)
- `budget_remaining` — company budget
- `role_data` — role-specific data (pipeline, backlog, content pieces, etc.)
- `messages` — messages from other agents
- `events` — active market events (competitor launch, PR crisis, etc.)
- `last_action_result` — result of the previous action
- `reward` — per-agent reward based on pipeline transitions, KPI deltas, collaboration

### Reward System
- **Pipeline rewards**: Agents earn rewards when customers advance stages (e.g. Sales +10 for closed_won)
- **Contract tiers**: Monthly (1x), 6-month (2x), Annual (3x) reward multiplier
- **Collaboration bonuses**: Content writing about shipped features, Sales using content in demos
- **Penalties**: Vaporware (-5), stale leads (-0.5 each), budget overrun warnings

## Development & Testing

```bash
# Run tests (12 tests)
python tests/test_env.py

# Run server locally
uvicorn server.app:app --reload
```

## Project Structure

```
office_os/
├── __init__.py              # Module exports
├── models.py                # Action & Observation Pydantic models
├── client.py                # OfficeOsEnv WebSocket client
├── run_agents.py            # Main LLM agent orchestration script
├── server/
│   ├── app.py               # FastAPI server (HTTP + WebSocket)
│   ├── office_os_environment.py  # Core environment (reset/step)
│   └── Dockerfile
├── market/
│   ├── config.py            # Constants, pipeline stages, contract tiers
│   ├── state.py             # MarketState, Customer, Feature, Campaign
│   ├── simulator.py         # Action execution engine
│   ├── events.py            # Random market events
│   └── metrics.py           # Reward calculation
├── agents/
│   ├── base_agent.py        # Smallville-style agent with memory
│   ├── memory.py            # Memory streams (observations/reflections/plans)
│   ├── llm_agent.py         # Claude-powered decision making
│   └── prompts.py           # Role-specific system prompts
├── integrations/
│   ├── sheets.py            # Google Sheets live sync
│   └── SHEETS_SETUP.md      # Setup guide
└── tests/
    └── test_env.py          # 12 tests
```
