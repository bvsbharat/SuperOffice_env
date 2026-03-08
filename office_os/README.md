# Office OS

A multi-agent startup simulation where 7 AI agents autonomously collaborate to grow a SaaS company from zero to a sustainable business. Built on Meta's [OpenEnv](https://github.com/meta-pytorch/openenv) framework.

Inspired by [Generative Agents](https://arxiv.org/abs/2304.03442) (Smallville), each agent maintains its own memory stream, communicates via a shared knowledge board, and makes decisions through structured LLM reasoning.

## Agents

| Agent | Role | Focus |
|-------|------|-------|
| **Jeeya** (CEO) | Strategy & budget | OKRs, budget allocation, pivots |
| **Alex** (Dev) | Product engineering | Build features, fix bugs, ship releases |
| **Jordan** (Marketing) | Growth | Campaigns, ads, funnel optimization |
| **Sam** (Sales) | Revenue | Lead qualification, demos, closing deals |
| **Casey** (Content) | Content creation | Blog posts, case studies, social media |
| **Pat** (HR/Ops) | Operations | Sprint planning, blockers, hiring |
| **Customer** | Market signal | Product feedback, feature requests, referrals |

Customers flow through a sales pipeline: `visitor → lead → qualified → demo → proposal → negotiation → closed_won`

## Quick Start

### Prerequisites

- Python 3.10+
- [uv](https://docs.astral.sh/uv/) package manager
- An LLM API key (Anthropic or AWS Bedrock)

### Install

```bash
cd office_os
uv sync
```

### Configure

```bash
# Anthropic
export ANTHROPIC_API_KEY=your-key

# OR AWS Bedrock
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
```

### Run

```bash
# Local simulation (10 days)
python run_agents.py --local --days 10

# With AWS Bedrock
python run_agents.py --local --bedrock --aws-region us-east-1

# Against an OpenEnv server
python run_agents.py --server http://localhost:8000
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--local` | Run directly without a server | — |
| `--server URL` | Connect to OpenEnv server | — |
| `--bedrock` | Use AWS Bedrock instead of Anthropic | `false` |
| `--days N` | Simulation length | `90` |
| `--model MODEL` | Claude model ID | `claude-sonnet-4-20250514` |
| `--reflect-every N` | Agent reflection frequency (turns) | `10` |

## How It Works

Each simulated day, agents take turns (round-robin) choosing actions scoped to their role. The market simulation engine processes each action, updates the company state, and calculates per-agent rewards.

**Key mechanics:**
- **Budget**: Start with $15k, $10k monthly refresh
- **Features**: Dev builds over multiple turns, then ships
- **Content**: Drives traffic, leads, and sales enablement
- **Pipeline**: Sales advances customers through 7 stages to close deals
- **Contract tiers**: Monthly (1x), 6-month (2x), annual (3x) reward
- **Market events**: Random events (competitor launch, viral moment, PR crisis) keep things dynamic
- **Memory**: Each agent has a Smallville-style memory stream (observations, reflections, plans)
- **Communication**: Agents message each other via a shared knowledge board

## Client API

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
# Development
uvicorn server.app:app --reload --host 0.0.0.0 --port 8000

# Docker
docker build -t office-os:latest -f server/Dockerfile .
docker run -p 8000:8000 office-os:latest

# Deploy to Hugging Face Spaces
openenv push
```

## Project Structure

```
office_os/
├── models.py                    # Action & Observation data models
├── client.py                    # WebSocket client SDK
├── run_agents.py                # Main orchestration script
├── frontend.py                  # Rich terminal dashboard
├── agents/
│   ├── base_agent.py            # Smallville-style agent with memory
│   ├── memory.py                # Memory streams (observations/reflections/plans)
│   ├── llm_agent.py             # Claude/Bedrock decision making
│   └── prompts.py               # Role-specific system prompts
├── market/
│   ├── config.py                # Game constants and pipeline stages
│   ├── state.py                 # MarketState, Customer, Feature, Campaign
│   ├── simulator.py             # Action execution engine
│   ├── metrics.py               # Reward calculation
│   └── events.py                # Random market events
├── server/
│   ├── app.py                   # FastAPI server (HTTP + WebSocket)
│   ├── office_os_environment.py # Core environment (reset/step)
│   └── Dockerfile
├── integrations/
│   └── sheets.py                # Google Sheets live sync
├── training/
│   ├── collector.py             # Trajectory collection
│   ├── trainer.py               # Remote training orchestration
│   ├── train_worker.py          # TRL GRPO training worker
│   └── Dockerfile.northflank
├── tests/
│   └── test_env.py
└── docs/
    ├── TECHNICAL.md              # Architecture & implementation details
    ├── google-sheets-setup.md    # Google Sheets integration guide
    └── northflank-h100-setup.md  # GPU training setup guide
```

## Optional Integrations

### Google Sheets Live Sync

Watch the simulation in a spreadsheet with live KPI updates, customer pipeline, and auto-generated invoices.

```bash
export GOOGLE_SHEETS_CREDENTIALS=/path/to/service-account.json
export GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id
```

See [docs/google-sheets-setup.md](docs/google-sheets-setup.md) for full setup.

### GPU Training (Northflank H100)

Train custom agent models using TRL GRPO reinforcement learning. After training, agents switch from Claude to the fine-tuned model.

See [docs/northflank-h100-setup.md](docs/northflank-h100-setup.md) for setup.

## Development

```bash
# Run tests
python tests/test_env.py

# Validate OpenEnv compatibility
openenv validate -v
```

## License

MIT
