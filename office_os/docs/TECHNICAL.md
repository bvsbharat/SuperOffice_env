# Technical Documentation

## Architecture Overview

Office OS is a multi-agent simulation built on Meta's [OpenEnv](https://github.com/meta-pytorch/openenv) framework. Seven LLM-powered agents operate a SaaS startup over 30 simulated days per episode, making autonomous decisions through a shared environment with asymmetric observations, individual memory streams, and a team knowledge board.

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
                              │  vLLM (Qwen 2.5 +   │
                              │  LoRA adapters) on   │
                              │  Northflank H100     │
                              │  ─── or ───          │
                              │  Claude (fallback)   │
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
| **Sales** | `QUALIFY_LEAD`, `RUN_DEMO`, `CLOSE_DEAL`, `UPDATE_SHEET` | Advances pipeline, generates revenue, syncs Google Sheets |
| **Content** | `WRITE_BLOG`, `WRITE_CASE_STUDY` | Creates content, drives traffic |
| **CEO** | `SET_OKRS`, `ALLOCATE_BUDGET`, `PIVOT` | Sets strategy, controls spending |
| **HR** | `PLAN_SPRINT`, `RESOLVE_BLOCKER` | Coordinates team, removes blockers |
| **Customer** | `EVALUATE_PRODUCT`, `REQUEST_FEATURE`, `RENEW_CONTRACT` | Provides feedback, drives requirements |

#### Reward Calculation (`market/metrics.py`)

The `RewardCalculator` computes per-agent rewards after each action. Rewards are the training signal — they tell agents which actions are valuable and drive GRPO optimization.

**Component 1: Pipeline Transition Rewards**

Agents earn rewards when customers advance through pipeline stages. Each stage has role-specific payouts, and `closed_won` rewards scale by contract tier:

| Stage | Sales | Marketing | Dev | Content | CEO | HR | Customer |
|-------|-------|-----------|-----|---------|-----|----|----------|
| visitor | — | — | — | +0.5 | — | — | — |
| lead | — | +1.5 | — | +1.0 | — | — | — |
| qualified | +1.0 | — | — | — | — | +0.3 | — |
| demo | +1.5 | — | +1.0 | — | — | — | — |
| proposal | +2.0 | — | — | — | — | — | — |
| closed_won | +10.0 | +3.0 | +2.0 | +2.0 | +5.0 | +1.0 | +2.0 |
| closed_lost | -3.0 | -1.0 | — | -0.5 | -2.0 | -0.5 | — |
| churned | -3.0 | -1.0 | -5.0 | -2.0 | -3.0 | -1.0 | -5.0 |

Contract tier multipliers on `closed_won`: monthly (1x), 6-month (2x), annual (3x).

**Component 2: KPI Delta Rewards**

Small rewards for improving company-wide metrics between turns:

| KPI | Primary beneficiary | Reward formula |
|-----|---------------------|----------------|
| Website traffic increase | Marketing, Content (+1x, diminishing after 5 pieces) / Others (+0.2x) | `min(delta / 500, 1.0)` |
| Revenue increase | Sales (+2x) / Others (+0.5x) | `min(delta / 5000, 2.0)` |
| Pipeline value increase | Sales | `min(delta / 10000, 1.0)` |
| Product stability increase | Dev | `min(delta * 15, 1.5)` |
| Customer satisfaction increase | All roles (+2x per delta) | `sat_delta * 2.0` |
| Customer satisfaction decrease | Dev, Sales, CEO | `sat_delta * 1.5` (penalty) |
| NPS improvement | All roles | `min(nps_delta / 20, 0.5)` |
| NPS drop > 5 | Dev, Sales, Customer | -0.3 |

**Component 3: Direct Action Rewards**

Specific high-impact actions carry inherent rewards:

| Agent | Action | Reward | Condition |
|-------|--------|--------|-----------|
| Dev | `SHIP_RELEASE` | +3.0 | Feature successfully shipped |
| Dev | `BUILD_FEATURE` | +1.0 | Feature ready to ship |
| Dev | `BUILD_FEATURE` | +0.5 | Build progress (turns remaining) |
| Dev | `FIX_BUG` | +0.8 | Bug fixed (+0.5 empathy bonus if customer-reported) |
| Dev | `REFACTOR` | +0.5 | Code quality improvement |
| Dev | `WRITE_DOCS` | +0.3 | Documentation written |
| Dev | `REVIEW_PR` | +0.3 | PR reviewed |
| Content | Any publish | +0.3 | Content published |
| Content | Work in progress | +0.2 | Content being written (turns remaining) |
| CEO | `SET_OKRS` | +1.0 | — |
| CEO | `SEND_DIRECTIVE` | +0.3 | — |
| HR | `RESOLVE_BLOCKER` | +1.5 | — |
| HR | `PLAN_SPRINT` | +0.5 | — |
| HR | Velocity boost | +1.0 | Action mentions velocity |
| Sales | `FOLLOW_UP` | +0.3 | Customer follow-up |
| Sales | `COLLECT_FEEDBACK` | +0.5 | Feedback collected |
| Sales | `UPDATE_SHEET` | +0.3 | Syncs pipeline to Google Sheets |
| Customer | `REFER_LEAD` | +1.0 | New lead generated |
| Customer | `RENEW_CONTRACT` | +1.5 | Contract renewed |
| Customer | `GIVE_FEEDBACK` | +0.5 | — |
| Customer | `EVALUATE_PRODUCT` | +0.3 | — |
| Customer | `ESCALATE_ISSUE` | +0.4 | Drives dev to fix bugs |
| Customer | `REQUEST_FEATURE` | +0.3 | Drives product development |
| Any | Failed action | -1.0 | `success: false` |

**Component 4: Collaboration Bonuses**

Cross-agent synergies that reward teamwork:

| Collaboration | Agents | Bonus |
|---------------|--------|-------|
| Content references a shipped feature | Content + Dev | +1.0 |
| Sales demos use existing content | Sales + Content | +0.5 |
| Dev builds feature from customer feedback | Dev + Sales | +1.0 |
| Marketing promotes existing content | Marketing + Content | +0.5 |

**Churn Prevention Bonuses** — When customer satisfaction < 0.4, agents get extra rewards for crisis-appropriate actions:

| Agent | Action | Bonus |
|-------|--------|-------|
| Dev | `FIX_BUG`, `REFACTOR` | +0.5 |
| Sales | `FOLLOW_UP`, `COLLECT_FEEDBACK` | +0.5 |
| CEO | `REVIEW_STRATEGY`, `SEND_DIRECTIVE` | +0.3 |
| HR | `RESOLVE_BLOCKER` | +0.5 |

**Component 5: Constraint Penalties**

| Violation | Agent | Penalty |
|-----------|-------|---------|
| Vaporware (unshipped feature referenced) | Any | -5.0 |
| Stale leads (not contacted in 4+ days) | Sales | -0.5 per lead |
| Budget overrun (budget < $1,000) | Marketing | -0.5 |
| Missing daily sheet update | Sales | -1.0 |

**Component 6: Base Success Reward**

All successful actions receive +0.1 as a shaping signal, ensuring GRPO gets gradient signal even on "maintenance" turns that don't trigger any of the above components.

#### Context Window Management (`agents/llm_agent.py`)

The vLLM server runs Qwen 2.5 14B with `--max-model-len 4096`. With 512 output tokens reserved, only 3534 input tokens are available for system prompt + user message. As simulations progress, accumulated state (pipeline customers, shared memory, recent actions, reflections) can exceed this budget.

**Two-layer defense:**

**Layer 1 — Sliding Window Limits** (in `_build_user_message`)

Sections are capped at build time to prevent unbounded growth:

| Section | Limit | Rationale |
|---------|-------|-----------|
| Pipeline customers | 8 max | Sales needs current pipeline, not history |
| Shared team memory | Last 3 entries | Most recent updates are most actionable |
| Team messages | Last 3 | Only current-turn conversations matter |
| Recent team actions | Last 3 | Older actions are already in shared memory |
| Role data JSON | 800 chars max | Compact summary, not raw dumps |
| Reflections | 2 max | High-level insights only |

**Layer 2 — Token-Aware Priority Pruning** (in `_prune_to_budget`)

Uses `tiktoken` (cl100k_base encoding) for actual token counting. When the assembled user message exceeds the token budget (`3534 - system_prompt_tokens`), sections are dropped by priority:

| Priority | Section | Drop order |
|----------|---------|------------|
| P0 (never dropped) | Header, KPIs, budget, pipeline/features | — |
| P1 | Shared team memory | 8th |
| P2 | Team messages | 7th |
| P3 | Active events | 6th |
| P4 | Recent team actions | 5th |
| P5 | Role data | 4th |
| P6 | Current plan | 3rd |
| P7 | Reflections | 2nd (dropped first) |
| P8 | Call to action | 1st (dropped first) |

If all droppable sections are removed and the message still exceeds budget, a binary-search hard truncation is applied as a last resort.

#### GRPO Training Reward (`training/train_worker.py`)

During GRPO training on the Northflank H100, a separate reward function scores each generated completion. This is distinct from the simulation reward — it evaluates **output quality** rather than business outcomes. Two reward functions run in parallel:

**Reward Function 1: Format & Validity Scorer** (`score_completion`)

Scores each completion on structural correctness (0.0 to ~1.45):

| Component | Score | Criteria |
|-----------|-------|----------|
| Valid JSON | +0.3 | Response parses as JSON |
| Clean output (no extra text) | +0.1 | No text before/after JSON |
| Has `action_type` field | +0.2 | JSON contains action_type |
| Valid action for role | +0.3 | action_type is in role's allowed list |
| Wrong-role action | -0.2 | action_type exists but isn't allowed for this role |
| Reasoning (10+ words) | +0.2 | Substantive reasoning |
| Reasoning (5-9 words) | +0.1 | Brief reasoning |
| Reasoning (1-4 words) | +0.05 | Minimal |
| Non-empty target | +0.1 | Target is meaningful (not "auto") |
| Target references context | +0.1 | Target mentions known customer/feature names |
| Proper message format | +0.1 | Message uses `"role: text"` format |
| Has parameters | +0.05 | Non-empty parameters dict |

**Reward Function 2: LLM-as-a-Judge** (`llm_judge_reward`)

A configurable LLM judge rates each completion on strategic quality using a 1-5 scale:

| Score | Meaning |
|-------|---------|
| 1 (→ 0.0) | Invalid/garbage output |
| 2 (→ 0.25) | Valid format but poor strategic choice |
| 3 (→ 0.5) | Acceptable action, generic reasoning |
| 4 (→ 0.75) | Good action with clear strategic reasoning |
| 5 (→ 1.0) | Excellent — right action, specific target, strong reasoning, good team communication |

The judge provider is configurable via `JUDGE_PROVIDER` env var:

| Provider | Default Model | Env Vars Needed |
|----------|---------------|-----------------|
| `bedrock` (default) | Claude Sonnet 4 (`us.anthropic.claude-sonnet-4-20250514-v1:0`) | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| `anthropic` | Claude Sonnet 4 (`claude-sonnet-4-20250514`) | `ANTHROPIC_API_KEY` |
| `openrouter` | Claude Sonnet 4 (`anthropic/claude-sonnet-4`) | `OPENROUTER_API_KEY` |
| `vllm` | Local Qwen 2.5 3B-Instruct | None (uses local vLLM) |

Bedrock is the default when `CLAUDE_CODE_USE_BEDROCK` is set. Override the model with `JUDGE_MODEL` or `--judge-model`. Falls back to 0.5 (neutral) on any error to avoid blocking training.

Both reward functions are passed to TRL's `GRPOTrainer` as `reward_funcs=[score_completion, llm_judge_reward]`.

#### Scenarios (`market/scenarios.py`)

Five scenarios test multi-agent coordination under different market conditions. Each scenario modifies initial state and injects scheduled events on specific days:

**Baseline GTM Launch** (`baseline`)
- Standard conditions. Market is receptive, competition is low.
- No scheduled events. Random events fire at normal 15% probability per day.

**Competitor Launch** (`competitor`)
- Starting traffic reduced to 80%. Event probability increased to 1.5x.
- Day 3: Competitor raises $50M — leads get objections, brand awareness drops.
- Day 7: Competitor matches your features — traffic drops, conversion drops, "Unique Differentiator" added to backlog.
- Day 15: Competitor offers discounts to your pipeline leads — satisfaction drops.
- Day 25: Competitor dominates press — brand awareness and traffic take major hit.

**Series A Pressure** (`series_a`)
- Starting budget doubled (2x). 4 initial leads + 2 extra enterprise customers seeded.
- Day 1: Board demands 3x MRR growth — directive posted to shared memory.
- Day 30: Investor mid-quarter review — revenue checked against target.
- Day 60: Final 30-day stretch — emergency $5k budget injection.

**Churn Spike** (`churn`)
- NPS starts at 25 (vs. 50 baseline). Satisfaction at 0.3 (vs. 0.5). Stability at 0.5 (vs. 1.0).
- 4 critical/high bugs pre-loaded in backlog.
- Day 1: 20% churn warning — NPS capped at 25.
- Day 5: Enterprise customer escalates to CEO — demands fixes in 7 days.
- Day 10: First customers actually cancel — up to 2 churn, NPS drops further.
- Day 20: Board checks if NPS > 40.

**Viral Moment** (`viral`)
- Starting traffic tripled (3x). 6 initial leads + 4 extra customers seeded.
- 2 infrastructure scaling items pre-loaded in backlog.
- Day 1: Product demo goes viral — traffic spikes 2-5k, brand awareness +20, 3-6 new leads.
- Day 3: 100+ demo requests flooding in — 4-8 new leads spawned.
- Day 7: Infrastructure strain — stability drops 0.3, NPS drops 15, critical bug added.
- Day 15: TechCrunch coverage — brand awareness +25, traffic spikes 3-8k.

#### Market Events (`market/events.py`)

Beyond scenario-scheduled events, the `EventEngine` injects random market events each day (15% base probability, modified by scenario):

| Event | Effect |
|-------|--------|
| Competitor Launch | Traffic -50 to -200, brand awareness -3, 20% of leads get objections |
| Viral Moment | Traffic +500 to +2000, brand awareness +10, 2-5 new leads spawned |
| PR Crisis | Brand awareness -15, all leads get "Concerned about recent press" objection |
| Algorithm Change | Traffic shifts -300 to +100 |
| Budget Cut | Budget reduced by 30% |
| Big Customer Inquiry | Enterprise lead ($200k budget) enters pipeline |
| Feature Request Wave | High-priority feature added to backlog from customer demand |
| Customer Success Story | Happy customer offers case study opportunity |

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
3. **Decide** — Call the LLM with system prompt + observation + memories → structured JSON action output
4. **Reflect** (periodic) — Generate higher-level reflections from recent observations
5. **Plan** (periodic) — Create plans based on current state and reflections

Two inference backends are supported:

| Backend | Model | Usage |
|---------|-------|-------|
| **vLLM** (primary) | Qwen 2.5 3B-Instruct + role-specific LoRA adapters | Production path — runs on Northflank H100, uses JSON prompting |
| **Claude** (fallback) | Claude Sonnet via Anthropic API | Alternative mode when no vLLM endpoint is configured |

When a vLLM endpoint is set (`set_vllm_endpoint()`), all agents use the Qwen model with their role-specific LoRA adapter. If no endpoint is configured, agents fall back to Claude.

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

Training triggers after each full episode (30 days). LoRA adapters are hot-loaded into vLLM — models improve without restarting inference.

#### GRPO Training Worker (`training/train_worker.py`)

Runs on the Northflank H100, using:
- **Unsloth** — 4-bit QLoRA for memory-efficient training
- **TRL GRPO** — Group Relative Policy Optimization
- **vLLM** — Serves the trained model, hot-loads new LoRA adapters

##### GRPO Algorithm

Group Relative Policy Optimization (GRPO) is an RL algorithm that trains language models by generating multiple completions per prompt, scoring them with reward functions, and using the relative ranking within each group to compute policy gradients. Unlike PPO, GRPO does not require a separate value network — it uses the group mean as the baseline.

**Training Flow:**

1. For each trajectory prompt, GRPO generates `num_generations=4` completions at `temperature=0.9`
2. Each completion is scored by two reward functions (see below)
3. Completions above the group mean reward are reinforced; below-mean completions are suppressed
4. The model is updated via gradient descent on the resulting policy gradient

**LoRA Configuration:**

| Parameter | Value |
|-----------|-------|
| Rank (r) | 32 |
| Alpha | 32 |
| Target modules | q_proj, k_proj, v_proj, o_proj, gate_proj, up_proj, down_proj |
| Quantization | 4-bit (Unsloth QLoRA) |
| Gradient checkpointing | Unsloth optimized |

**GRPO Training Hyperparameters:**

| Parameter | Value |
|-----------|-------|
| Generations per prompt | 4 |
| Max prompt length | 3072 tokens |
| Max completion length | 1024 tokens |
| Temperature | 0.9 |
| Learning rate | 2e-5 (configurable) |
| Batch size | 1 (per device) |
| Gradient accumulation | 4 steps |
| Training epochs | 3 |
| Max steps | min(50, num_trajectories × 3) |
| Precision | bf16 |
| Optimizer | AdamW 8-bit |

**Post-Training:**

1. LoRA adapter saved to `/tmp/office_os_lora/{role}/adapter`
2. Optionally pushed to HuggingFace (`HF_REPO` env var)
3. Hot-loaded into running vLLM via `POST /v1/load_lora_adapter` (no restart needed)
4. GPU memory freed (model + trainer deleted, CUDA cache emptied)

Subsequent episodes use the trained LoRA adapters — each role improves independently while sharing the same base model.

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
| `INITIAL_BUDGET` | $100,000 | Starting company budget |
| `MONTHLY_BUDGET_REFRESH` | $10,000 | Budget added each month (every 30 days) |
| `EPISODE_DAYS` | 30 | Default episode length |
| `TURNS_PER_DAY` | 14 | Turns per simulation day (3+8+2+1 across 4 phases) |
| `PIPELINE_STAGES` | 9 stages | visitor → lead → qualified → demo → proposal → negotiation → closed_won / closed_lost / churned |
| `CONTRACT_TIERS` | 3 tiers | monthly (1x), 6-month (2x), annual (3x) |
| `FEATURE_BUILD_TURNS` | 3 | Turns to complete a feature |
| `BLOG_WRITE_TURNS` | 3 | Turns to write a blog post |
| `CASE_STUDY_WRITE_TURNS` | 4 | Turns to write a case study |
| `EMAIL_WRITE_TURNS` | 2 | Turns to write an email sequence |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NORTHFLANK_INFERENCE_ENDPOINT` | Yes* | vLLM URL on Northflank H100 |
| `ANTHROPIC_API_KEY` | Yes* | Claude API key (fallback mode) |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | No | Google Sheets ID for live sync |
| `GOOGLE_SHEETS_CREDENTIALS` | No | Service account JSON path or inline JSON |
| `HF_TOKEN` | No | HuggingFace token (for model access & LoRA push) |
| `WANDB_API_KEY` | No | Weights & Biases for training metrics |

\* Either a Northflank vLLM endpoint (primary) or Anthropic API key (fallback) is required.

## Testing

```bash
# Run unit tests
python tests/test_env.py

# Validate OpenEnv compatibility
openenv validate -v
```
