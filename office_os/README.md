---
title: Office Os Environment Server
emoji: 🏢
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

A Smallville-style multi-agent simulation where 7 AI agents (CEO, Dev, Marketing, Sales, Content Creator, HR, Customer) autonomously collaborate to grow a SaaS startup over 90 simulated days. Built on Meta's [OpenEnv](https://github.com/meta-pytorch/openenv) framework with optional ART reinforcement learning on Northflank H100 GPUs.

## Prerequisites

- Python 3.10+
- [uv](https://docs.astral.sh/uv/) package manager
- An LLM API key (Anthropic or AWS Bedrock)

## Setup

```bash
# Clone and install
cd office_os
uv sync

# Configure environment (copy from parent .env or set directly)
export ANTHROPIC_API_KEY=your-key

# Optional: Google Sheets live sync
export GOOGLE_SHEETS_CREDENTIALS=/path/to/service-account.json
export GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id
```

Environment variables are loaded from `../.env` automatically via `python-dotenv`.

## Run the Simulation

```bash
# Run locally with Anthropic API
python run_agents.py --local --days 10

# Run locally with AWS Bedrock
python run_agents.py --local --bedrock --aws-region us-east-1

# Run against the environment server
python run_agents.py --server http://localhost:8000
```

Options:
- `--local` — run directly without a server
- `--server URL` — run against the OpenEnv server
- `--bedrock` — use AWS Bedrock instead of Anthropic API
- `--days N` — number of simulated days (default: 90)
- `--model MODEL` — Claude model to use (default: claude-sonnet-4-20250514)
- `--reflect-every N` — agent reflection frequency in turns (default: 10)

## How It Works

7 LLM-powered agents take turns operating a startup:

| Agent | Role | Key Actions |
|-------|------|-------------|
| Jeeya (CEO) | Strategy & budget | SET_OKRS, ALLOCATE_BUDGET, PIVOT, SEND_DIRECTIVE |
| Alex (Dev) | Build product | BUILD_FEATURE, FIX_BUG, SHIP_RELEASE |
| Jordan (Marketing) | Drive growth | LAUNCH_CAMPAIGN, RUN_AD, OPTIMIZE_FUNNEL |
| Sam (Sales) | Close deals | QUALIFY_LEAD, RUN_DEMO, CLOSE_DEAL |
| Casey (Content) | Create content | WRITE_BLOG, WRITE_CASE_STUDY, WRITE_SOCIAL_POST |
| Pat (HR) | Operations | PLAN_SPRINT, RESOLVE_BLOCKER, HIRE_CONTRACTOR |
| Customer | Reward oracle | EVALUATE_PRODUCT, REQUEST_FEATURE, REFER_LEAD, RENEW_CONTRACT |

Customers flow through a pipeline: `visitor -> lead -> qualified -> demo -> proposal -> negotiation -> closed_won`

Deals can be closed with contract tiers: **monthly** (1x reward), **6-month** (2x), **annual** (3x).

Each agent has a Smallville-style memory stream (observations, reflections, plans), a shared team memory board for A2A communication, and receives asymmetric observations scoped to their role.

### Google Sheets Integration

Enable live sync to watch the simulation in a spreadsheet — see [Sheets Setup](integrations/SHEETS_SETUP.md).

Set `GOOGLE_SHEETS_CREDENTIALS` to either:
- A **file path** (local dev): `/path/to/service-account.json`
- **Inline JSON** (HF Spaces / Docker): paste the full JSON as the env var value

### ART Reinforcement Learning (Optional)

Train custom agent models on a Northflank H100 GPU using OpenPipe ART (GRPO). After training, agents switch from Claude to the fine-tuned model.

```bash
# Install ART client dependencies
uv sync --extra art

# Run with ART training enabled
python run_agents.py --local --days 10 --art --northflank-url https://your-endpoint.code.run
```

See [Northflank Setup](training/NORTHFLANK_SETUP.md) for server-side configuration.

## Client API

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

## Running the Server

```bash
# Local development
uvicorn server.app:app --reload --host 0.0.0.0 --port 8000

# Docker
docker build -t office_os-env:latest -f server/Dockerfile .
docker run -p 8000:8000 office_os-env:latest

# Deploy to Hugging Face Spaces
openenv push                          # Push to your namespace
openenv push --repo-id my-org/my-env  # Push to specific repo
openenv push --private                # Deploy as private
```

## Environment Details

### Action (OfficeOsAction)
- `agent_id` — which agent: dev, marketing, sales, content, ceo, hr, customer
- `action_type` — e.g. BUILD_FEATURE, LAUNCH_CAMPAIGN, CLOSE_DEAL, WRITE_BLOG
- `target` — what the action applies to (feature name, customer name, etc.)
- `parameters` — action-specific params (e.g. `{"contract_tier": "annual"}`)
- `reasoning` — agent's reasoning for the action
- `message` — optional message to another agent (`"dev: please build SSO"`)

### Observation (OfficeOsObservation)
- `day`, `phase` — simulation time (1-90 days, 4 phases per day)
- `kpis` — role-scoped KPI metrics
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

## Development

```bash
# Run tests
python tests/test_env.py

# Validate OpenEnv compatibility
openenv validate -v
```

## Project Structure

```
office_os/
├── __init__.py                  # Module exports
├── models.py                    # Action & Observation Pydantic models
├── client.py                    # OfficeOsEnv WebSocket client
├── run_agents.py                # Main LLM agent orchestration script
├── openenv.yaml                 # OpenEnv manifest
├── pyproject.toml               # Dependencies & build config
├── server/
│   ├── app.py                   # FastAPI server (HTTP + WebSocket)
│   ├── office_os_environment.py # Core environment (reset/step)
│   └── Dockerfile
├── market/
│   ├── config.py                # Constants, pipeline stages, contract tiers
│   ├── state.py                 # MarketState, Customer, Feature, Campaign
│   ├── simulator.py             # Action execution engine
│   ├── events.py                # Random market events
│   └── metrics.py               # Reward calculation
├── agents/
│   ├── base_agent.py            # Smallville-style agent with memory
│   ├── memory.py                # Memory streams (observations/reflections/plans)
│   ├── llm_agent.py             # Claude-powered decision making
│   └── prompts.py               # Role-specific system prompts
├── integrations/
│   ├── sheets.py                # Google Sheets live sync
│   └── SHEETS_SETUP.md          # Setup guide
├── training/
│   ├── collector.py             # Trajectory collection for ART
│   ├── trainer.py               # ART training loop
│   ├── train_worker.py          # Training worker process
│   ├── northflank_server.py     # Northflank H100 API server
│   ├── Dockerfile.northflank    # Docker image for Northflank
│   └── NORTHFLANK_SETUP.md      # H100 setup guide
└── tests/
    └── test_env.py
```
