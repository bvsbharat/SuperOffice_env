# Technical Documentation

## Architecture Overview

Office OS is a multi-agent simulation built on Meta's [OpenEnv](https://github.com/meta-pytorch/openenv) framework. Seven LLM-powered agents operate a SaaS startup over 90 simulated days, making autonomous decisions through a shared environment with asymmetric observations, individual memory streams, and a team knowledge board.

```
                          ┌──────────────────────────────────┐
                          │         OpenEnv Server           │
                          │   (FastAPI + WebSocket)          │
                          │                                  │
                          │  ┌───────────────────────────┐   │
                          │  │  OfficeOsEnvironment      │   │
                          │  │  - reset() / step()       │   │
                          │  │  - MarketSimulator         │   │
                          │  │  - EventEngine             │   │
                          │  │  - RewardCalculator        │   │
                          │  └───────────┬───────────────┘   │
                          │              │                    │
                          └──────────────┼────────────────────┘
                                         │
                    ┌────────────────────┼──────────────────────┐
                    │                    │                      │
              ┌─────▼─────┐      ┌──────▼──────┐       ┌──────▼──────┐
              │ LLMAgent  │      │ LLMAgent    │  ...  │ LLMAgent    │
              │ (CEO)     │      │ (Dev)       │       │ (Customer)  │
              │           │      │             │       │             │
              │ Memory    │      │ Memory      │       │ Memory      │
              │ Stream    │      │ Stream      │       │ Stream      │
              └─────┬─────┘      └──────┬──────┘       └──────┬──────┘
                    │                    │                      │
                    └────────────────────┼──────────────────────┘
                                         │
                              ┌──────────▼──────────┐
                              │  Claude / Bedrock   │
                              │  (or vLLM for       │
                              │   fine-tuned models) │
                              └─────────────────────┘
```

## Core Components

### 1. Market Simulation Engine (`market/`)

The simulation engine manages the startup's state and processes agent actions.

#### State Management (`market/state.py`)

Central data structures representing the simulation world:

- **`MarketState`** — Global state container holding all KPIs, customers, features, content, campaigns, budget, and the shared memory board.
- **`Customer`** — Represents a potential or active customer moving through the sales pipeline. Tracks company size, industry, budget, pain points, satisfaction, and contract tier.
- **`Feature`** — Product features under development or shipped. Tracks build progress, stability, and bugs.
- **`ContentPiece`** — Blog posts, social posts, case studies, and email sequences created by the Content agent.
- **`Campaign`** — Marketing campaigns with cost and lead generation tracking.
- **`Message`** — Agent-to-agent communication messages posted to the shared board.

#### Action Execution (`market/simulator.py`)

The `MarketSimulator` dispatches each agent's chosen action to a role-specific handler:

```python
# Simplified flow
def step(action: OfficeOsAction, state: MarketState) -> dict:
    handler = ACTION_HANDLERS[action.action_type]
    result = handler(action, state)
    state.recent_actions.append(action)
    return result
```

Each handler modifies the market state and returns a result dict. Key handler categories:

| Role | Handlers | State Effects |
|------|----------|---------------|
| **Dev** | `BUILD_FEATURE`, `FIX_BUG`, `SHIP_RELEASE` | Creates/ships features, affects product stability |
| **Marketing** | `LAUNCH_CAMPAIGN`, `RUN_AD`, `OPTIMIZE_FUNNEL` | Spends budget, generates traffic/leads |
| **Sales** | `QUALIFY_LEAD`, `RUN_DEMO`, `CLOSE_DEAL` | Advances pipeline, generates revenue |
| **Content** | `WRITE_BLOG`, `WRITE_CASE_STUDY` | Creates content, drives traffic |
| **CEO** | `SET_OKRS`, `ALLOCATE_BUDGET`, `PIVOT` | Sets strategy, controls spending |
| **HR** | `PLAN_SPRINT`, `RESOLVE_BLOCKER` | Coordinates team, removes blockers |
| **Customer** | `EVALUATE_PRODUCT`, `REQUEST_FEATURE`, `RENEW_CONTRACT` | Provides feedback, drives requirements |

#### Reward Calculation (`market/metrics.py`)

The `RewardCalculator` computes per-agent rewards after each action with multiple components:

1. **Pipeline transition rewards** — Agents earn rewards when customers advance through the pipeline (`visitor → lead → qualified → demo → proposal → negotiation → closed_won`). Rewards scale by contract tier (monthly 1x, 6-month 2x, annual 3x).
2. **KPI delta rewards** — Changes in key metrics (revenue, traffic, conversion, stability) contribute to reward.
3. **Direct action rewards** — Specific actions carry inherent rewards (e.g., shipping a feature, publishing content).
4. **Collaboration bonuses** — Cross-agent synergies earn extra reward (content about shipped features, sales referencing content in demos).
5. **Constraint penalties** — Stale leads (-0.5 each), budget overrun warnings, vaporware (announced but unbuilt features, -5).

#### Market Events (`market/events.py`)

The `EventEngine` injects random market events to create dynamic scenarios:

| Event | Effect |
|-------|--------|
| Competitor Launch | Reduces traffic, increases urgency |
| Viral Moment | Spikes traffic, generates leads |
| PR Crisis | Drops brand awareness, requires response |
| Algorithm Change | Shifts content effectiveness |
| Budget Cut | Reduces available budget |
| Big Customer Inquiry | High-value lead enters pipeline |
| Feature Request Wave | Multiple customers request same feature |
| Success Story | Boosts brand awareness, generates referrals |

### 2. Agent System (`agents/`)

#### Smallville-Style Memory (`agents/memory.py`)

Each agent maintains an individual `MemoryStream` inspired by the [Generative Agents](https://arxiv.org/abs/2304.03442) (Smallville) architecture:

```
MemoryStream
├── Observations  — raw facts from the environment ("Revenue hit $5k")
├── Reflections   — higher-level insights ("Our content strategy is working")
└── Plans         — intended future actions ("Will focus on enterprise leads")
```

Memory retrieval uses a scoring function combining:
- **Recency** — Exponential decay based on turns since creation
- **Importance** — Manually assigned significance score (1-10)

Top-K memories are retrieved and included in the agent's LLM context to inform decisions.

#### LLM Decision Making (`agents/llm_agent.py`)

The `LLMAgent` class handles the core decision loop:

1. **Observe** — Receive role-scoped observation from the environment
2. **Retrieve** — Pull relevant memories from the memory stream
3. **Decide** — Call Claude/Bedrock with system prompt + observation + memories → structured action output
4. **Reflect** (periodic) — Generate higher-level reflections from recent observations
5. **Plan** (periodic) — Create plans based on current state and reflections

LLM calls use structured output (Pydantic models) to ensure valid actions:

```python
class AgentAction(BaseModel):
    action_type: str        # Must be in role's allowed actions
    target: str             # What the action applies to
    parameters: dict        # Action-specific params
    reasoning: str          # Why this action was chosen
    message: Optional[str]  # Optional A2A message ("dev: build SSO please")
```

#### Role-Specific Prompts (`agents/prompts.py`)

Each agent role has a tailored system prompt that includes:
- Role identity and responsibilities
- Available actions with descriptions
- Collaboration patterns (who to communicate with, and when)
- Strategic priorities and decision-making guidance
- Shared context (pipeline stages, team structure, shared memory format)

### 3. Server & Client (`server/`, `client.py`)

#### OpenEnv Server (`server/app.py`)

FastAPI application exposing the environment via HTTP and WebSocket:

```
Endpoints:
  POST /reset           — Initialize new simulation, returns first observation
  POST /step            — Execute an action, returns observation + reward
  GET  /state           — Current market state snapshot
  GET  /schema          — Action/observation JSON schemas
  WS   /ws              — WebSocket for persistent session
```

The server wraps `OfficeOsEnvironment` (`server/office_os_environment.py`) which implements the standard OpenEnv `reset()`/`step()` interface.

#### Python Client (`client.py`)

`OfficeOsEnv` is a WebSocket client implementing `EnvClient[OfficeOsAction, OfficeOsObservation]`:

```python
from office_os import OfficeOsAction, OfficeOsEnv

with OfficeOsEnv(base_url="http://localhost:8000") as env:
    result = env.reset()
    result = env.step(OfficeOsAction(
        agent_id="dev",
        action_type="BUILD_FEATURE",
        target="SSO Integration",
    ))
```

### 4. Integrations (`integrations/`)

#### Google Sheets Sync (`integrations/sheets.py`)

`GoogleSheetsSync` pushes live simulation data to a Google Spreadsheet:

- **Dashboard** sheet — KPIs updated every turn (revenue, traffic, conversion, budget, pipeline counts)
- **Customers** sheet — Full pipeline view (name, stage, budget, pain points, days since contact)
- **Invoice-XXX** sheets — Auto-created when deals close with contract details

The integration is optional — the simulation runs identically without it. See [Google Sheets Setup](google-sheets-setup.md) for configuration.

### 5. Training Pipeline (`training/`)

#### Trajectory Collection (`training/collector.py`)

`TrajectoryCollector` records every agent turn as a training example:

```python
@dataclass
class TurnRecord:
    role: str                    # Agent role (dev, sales, etc.)
    system_prompt: str           # Full system prompt sent to LLM
    user_message: str            # Observation formatted as user message
    assistant_response: dict     # Agent's chosen action
    reward: float                # Calculated reward for this action
    day: int                     # Simulation day
    turn: int                    # Turn number
```

Trajectories are grouped by role for per-agent training.

#### Remote Training (`training/trainer.py`)

`RemoteTrainer` sends trajectory batches to a Northflank H100 GPU for training:

```
Simulation (local)  →  POST /train  →  Northflank H100
                                        ├── TRL GRPO training
                                        ├── LoRA adapter creation
                                        └── vLLM hot-reload
```

Training triggers every N simulation days (configurable). After training, agents can switch from Claude to the fine-tuned model.

#### GRPO Training Worker (`training/train_worker.py`)

Runs on the Northflank H100, using:
- **Unsloth** — 4-bit QLoRA for memory-efficient training
- **TRL GRPO** — Group Relative Policy Optimization
- **vLLM** — Serves the trained model, hot-loads new LoRA adapters

See [Northflank H100 Setup](northflank-h100-setup.md) for deployment instructions.

### 6. Frontend (`frontend.py`)

Rich terminal UI dashboard showing:
- Day/phase/turn header
- KPI panel (revenue, traffic, conversion, budget, pipeline, stability)
- Customer pipeline table
- Agent action log with reasoning
- Agent-to-agent message board

## Data Flow

```
1. Orchestrator (run_agents.py) loops through agents round-robin each day
2. For each agent:
   a. Environment generates role-scoped observation
   b. Agent retrieves relevant memories
   c. LLM produces structured action decision
   d. Action is submitted to the environment
   e. MarketSimulator executes the action, updates state
   f. EventEngine may inject random market events
   g. RewardCalculator computes per-agent reward
   h. TrajectoryCollector records the turn (if training enabled)
   i. Google Sheets sync updates (if configured)
3. Every N days, TrajectoryCollector sends batch to Northflank for training
4. After training, agents optionally switch to fine-tuned model
```

## Configuration Reference

### Game Constants (`market/config.py`)

| Constant | Value | Description |
|----------|-------|-------------|
| `INITIAL_BUDGET` | $15,000 | Starting company budget |
| `MONTHLY_BUDGET_REFRESH` | $10,000 | Budget added each month (every 30 days) |
| `MAX_DAYS` | 90 | Default simulation length |
| `PIPELINE_STAGES` | 7 stages | visitor → lead → qualified → demo → proposal → negotiation → closed_won |
| `CONTRACT_TIERS` | 3 tiers | monthly (1x), 6-month (2x), annual (3x) |
| `FEATURE_BUILD_TURNS` | 3 | Turns to complete a feature |
| `CONTENT_WRITE_TURNS` | 1 | Turns to create content |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes* | Claude API key |
| `AWS_ACCESS_KEY_ID` | Yes* | AWS Bedrock credentials |
| `AWS_SECRET_ACCESS_KEY` | Yes* | AWS Bedrock credentials |
| `AWS_REGION` | No | Bedrock region (default: `us-east-1`) |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | No | Google Sheets ID for live sync |
| `GOOGLE_SHEETS_CREDENTIALS` | No | Service account JSON path or inline JSON |
| `NORTHFLANK_INFERENCE_ENDPOINT` | No | vLLM URL on Northflank H100 |
| `HF_TOKEN` | No | HuggingFace token (for gated models) |
| `WANDB_API_KEY` | No | Weights & Biases for training metrics |

\* Either Anthropic or AWS Bedrock credentials required.

## Testing

```bash
# Run unit tests
python tests/test_env.py

# Validate OpenEnv compatibility
openenv validate -v
```
