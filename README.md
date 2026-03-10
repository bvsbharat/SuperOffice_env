<div align="center">

# O2 OpenOffice

### Multi-Agent Reinforcement Learning Environment for Organizational Decision-Making

**Multi-agent. Multi-mind. One office.**

[![Built on OpenEnv](https://img.shields.io/badge/Built%20on-OpenEnv-blue)](https://github.com/meta-pytorch/OpenEnv)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-green)](https://python.org)
[![React + Phaser + Three.js](https://img.shields.io/badge/Frontend-React%20%2B%20Phaser%20%2B%20Three.js-61DAFB)](https://reactjs.org)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-orange)](LICENSE)
[![Trained LoRA Adapters](https://img.shields.io/badge/HuggingFace-LoRA%20Adapters-yellow)](https://huggingface.co/HarshalH/office-os-loras)
[![Demo Video](https://img.shields.io/badge/Demo-YouTube-red)](https://youtu.be/dfWrsrGQCQo)

[**Watch the Demo Video**](https://youtu.be/dfWrsrGQCQo)

</div>

---

## What Is This?

A **Gymnasium-compatible multi-agent RL environment** where seven LLM-powered agents run a startup together. The "world" is a startup office; the agents are its people: CEO, Dev, Marketing, Sales, Content, HR, and a Customer oracle. Each agent observes local state, takes role-scoped actions, receives asymmetric reward signals, and coordinates with every other agent through a shared memory board.

Five adversarial scenarios stress-test the environment: **Baseline GTM Launch**, **Competitor Launch**, **Series A Pressure**, **Churn Spike**, and **Viral Moment** — each shifting reward dynamics and forcing agents to adapt their coordination strategies in real time.

The training pipeline collects trajectories during simulation and fine-tunes **Qwen 2.5 14B** with **GRPO + LoRA** on a remote H100, then hot-loads the adapters back into vLLM for inference. Each of the 7 roles gets its own LoRA adapter, trained on its specific reward signal.

> Built for the **OpenEnv Hackathon 2026** (Meta PyTorch).

---

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [The Seven Agents](#the-seven-agents)
- [Reward Function](#reward-function)
- [Five Adversarial Scenarios](#five-adversarial-scenarios)
- [Training Pipeline](#training-pipeline)
- [Frontend](#frontend)
- [Supported Models](#supported-models)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Key Design Decisions](#key-design-decisions)
- [Research Inspirations](#research-inspirations)
- [Contributing](#contributing)
- [License](#license)

---

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- One of: AWS credentials (Bedrock), Anthropic API key, or a vLLM endpoint

### Installation

```bash
# Clone
git clone https://github.com/bvsbharat/SuperOffice_env.git
cd SuperOffice_env

# Backend dependencies
pip install -e office_os/
# or
pip install -r requirements.txt

# Frontend dependencies
cd demo/frontend && npm install && cd ../..

# Environment variables
cp .env.example .env
# Edit .env with your API keys (see Configuration section)
```

### Run the Demo (Frontend + Backend)

```bash
# Terminal 1 — Backend API (pick one)
cd demo

# Option A: Claude on Bedrock (default)
npm run BE_LLM

# Option B: Trained Qwen 2.5 14B LoRA on Northflank vLLM
npm run BE_TRAINED

# Option C: Custom vLLM endpoint
npm run BE_ART

# Terminal 2 — Frontend
cd demo
npm run start
```

Open **http://localhost:5173** — select a model, hit **Reset**, then **Play**.

### Headless Mode (No Frontend)

```bash
# Run a single episode from CLI
python office_os/run_agents.py --scenario baseline --use-claude --days 30

# Run against vLLM endpoint
python office_os/run_agents.py --scenario competitor --northflank-endpoint https://your-endpoint --days 10

# Full training loop (10 episodes x 5 scenarios)
python office_os/train_loop.py --northflank-endpoint https://your-endpoint --episodes 10
```

---

## Architecture

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                                                                             │
 │   FRONTEND  (React 19 + Vite)                                              │
 │                                                                             │
 │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
 │   │  2D Pixel-Art │  │  4D Three.js  │  │  Dashboard   │  │  Playground  │  │
 │   │  Office Map   │  │  3D Office    │  │  (Tabular)   │  │  (Sandbox)   │  │
 │   │  (Phaser 3)   │  │  (R3F + Drei) │  │              │  │              │  │
 │   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
 │          └─────────────┬───┴───────────┬──────┘                 │           │
 │                        │               │                        │           │
 │                 Zustand Store     WebSocket /ws           REST /api/*       │
 │                                                                             │
 ├─────────────────────────────────────────────────────────────────────────────┤
 │                                                                             │
 │   DEMO API  (FastAPI + Uvicorn)          port 8080                         │
 │                                                                             │
 │   routes.py ──► rl_bridge.py ──► claude_bridge.py                          │
 │   /api/reset     Wraps Env +      Anthropic / Bedrock                      │
 │   /api/step      7 LLM Agents     / vLLM routing                          │
 │   /api/state     Collaboration                                             │
 │   /api/config    Detection                                                 │
 │   /ws/live                                                                 │
 │                                                                             │
 ├─────────────────────────────────────────────────────────────────────────────┤
 │                                                                             │
 │   OFFICE OS  (Core RL Engine)                                              │
 │                                                                             │
 │   ┌──────────────────────────────────────────────────────────────────────┐  │
 │   │  OfficeOsEnvironment  (OpenEnv / Gymnasium interface)               │  │
 │   │                                                                      │  │
 │   │  reset() → MarketState.initial(scenario)                            │  │
 │   │  step(action) → MarketSimulator → RewardCalculator → observation    │  │
 │   └──────────────────────────────────────────────────────────────────────┘  │
 │                                                                             │
 │   Agents          Market            Scenarios         Training              │
 │   ────────        ──────            ─────────         ────────              │
 │   BaseAgent       MarketState       Baseline          GRPO via             │
 │   LLMAgent        Simulator         Competitor        TRL + Unsloth        │
 │   MemoryStream    EventEngine       Series A          LoRA Adapters        │
 │   Prompts         RewardCalc        Churn Spike       Qwen 2.5 14B        │
 │                   Config            Viral Moment      Northflank H100      │
 │                                                                             │
 ├─────────────────────────────────────────────────────────────────────────────┤
 │                                                                             │
 │   LLM PROVIDERS  (Pluggable, hot-swappable at runtime)                     │
 │                                                                             │
 │   Anthropic API ── AWS Bedrock ── vLLM (OpenAI-compatible)                 │
 │                                                                             │
 │   Claude Haiku 4.5 │ Claude Sonnet 4.6 │ Claude Opus 4.6                   │
 │   Qwen 2.5 14B *   │ Qwen3 80B         │ Llama 3.3 70B                    │
 │   Ministral 14B    │ Gemma 3 4B         │ MiniMax M2                       │
 │                                     * = GRPO-trained LoRA adapters         │
 └─────────────────────────────────────────────────────────────────────────────┘
```

### Agent Decision Flow (Per Turn)

```
 Environment State
       │
       ▼
 Build Observation (role-scoped KPIs, pipeline, messages, events, memory)
       │
       ▼
 Token-Aware Pruning (priority P0-P8, fits context window)
       │
       ▼
 LLM Agent Decides → AgentAction { action_type, target, parameters, reasoning, message }
       │
       ▼
 Validate (role-allowed actions only; reject + retry up to 8x)
       │
       ├──────────────────────┬─────────────────────┐
       ▼                      ▼                     ▼
 MarketSimulator        EventEngine          Collaboration
 Execute action         Fire events          Detection
 Update state           Apply modifiers      (mentions + targets)
       │                      │                     │
       └──────────────────────┴─────────────────────┘
                              │
                              ▼
                     RewardCalculator
                     R = pipeline_stage + kpi_delta + action_reward
                       + collaboration_bonus - penalties + base_shaping
                              │
                              ▼
                     Update Memory Stream → Reflect → Plan → Broadcast
```

---

## The Seven Agents

| Agent | Role | Key Actions | Primary Reward Drivers |
|-------|------|-------------|------------------------|
| **CEO** (Jeeya) | Strategic direction | `SET_OKRS`, `ALLOCATE_BUDGET`, `REVIEW_STRATEGY`, `PIVOT`, `SEND_DIRECTIVE`, `APPROVE_INITIATIVE` | Closed deals (+5.0), churned customers (-3.0), budget efficiency |
| **Dev** (Alex) | Product engineering | `BUILD_FEATURE`, `FIX_BUG`, `SHIP_RELEASE`, `REFACTOR`, `WRITE_DOCS`, `REVIEW_PR` | Feature ships (+3.0), demos (+1.0), churn (-5.0), stability |
| **Marketing** (Jordan) | Demand generation | `LAUNCH_CAMPAIGN`, `RUN_AD`, `RESEARCH_MARKET`, `ANALYZE_COMPETITOR`, `OPTIMIZE_FUNNEL`, `A_B_TEST` | Leads (+1.5), closed deals (+3.0), traffic, conversion rate |
| **Sales** (Sam) | Revenue closure | `QUALIFY_LEAD`, `RUN_DEMO`, `SEND_PROPOSAL`, `CLOSE_DEAL`, `FOLLOW_UP`, `COLLECT_FEEDBACK` | Closed deals (+10.0), pipeline progression, lost deals (-3.0), win rate |
| **Content** (Casey) | Thought leadership | `WRITE_BLOG`, `WRITE_SOCIAL_POST`, `WRITE_CASE_STUDY`, `WRITE_EMAIL_SEQUENCE`, `WRITE_DOCS`, `REVISE_CONTENT` | Visitor traffic (+0.5), leads (+1.0), closed deals (+2.0) |
| **HR** (Pat) | Operations & planning | `PLAN_SPRINT`, `TRACK_OKRS`, `RESOLVE_BLOCKER`, `HIRE_CONTRACTOR`, `PERFORMANCE_REVIEW`, `TEAM_SYNC` | Team velocity, blocker resolution (+1.5), OKR tracking |
| **Customer** | Reward oracle | `EVALUATE_PRODUCT`, `REQUEST_FEATURE`, `GIVE_FEEDBACK`, `REFER_LEAD`, `ESCALATE_ISSUE`, `RENEW_CONTRACT` | NPS, satisfaction, expansion revenue, churn signals (-5.0) |

### Agent Cognitive Architecture

Each agent has a **Smallville-style memory system** (inspired by [Park et al., 2023](https://arxiv.org/abs/2304.03442)):

- **Observations**: Raw environment events stored with importance scores
- **Reflections**: Periodically synthesized insights from recent memories
- **Plans**: High-level strategies updated based on reflections
- **Retrieval**: Recency + importance scoring with exponential decay (capacity: 200 memories, LRU eviction)

Prompts are built per-turn with **priority-based token pruning** (P0 = KPIs/pipeline, P8 = call to action). Lower-priority sections are dropped to fit the model's context window.

---

## Reward Function

The reward signal is a **composite function** with six components, calculated per-agent per-turn:

```
R(agent, turn) = pipeline_stage_reward      # Customer moves through funnel
               + kpi_delta_reward            # Improvement in role-specific KPIs
               + action_reward               # Direct outcome of the action taken
               + collaboration_bonus         # Building on another agent's work
               - constraint_penalties        # Budget overruns, invalid targets, stale leads
               + base_shaping               # +0.1 for any successful action (ensures gradient)
```

### Pipeline Stage Rewards (Asymmetric per Role)

| Stage | Sales | Marketing | Dev | Content | CEO | HR | Customer |
|-------|-------|-----------|-----|---------|-----|-----|----------|
| visitor | — | — | — | +0.5 | — | — | — |
| lead | — | +1.5 | — | +1.0 | — | — | — |
| qualified | +1.0 | — | — | — | — | +0.3 | — |
| demo | +1.5 | — | +1.0 | — | — | — | — |
| proposal | +2.0 | — | — | — | — | — | — |
| **closed_won** | **+10.0** | +3.0 | +2.0 | +2.0 | +5.0 | +1.0 | +2.0 |
| closed_lost | -3.0 | -1.0 | — | -0.5 | -2.0 | -0.5 | — |
| churned | -3.0 | -1.0 | **-5.0** | -2.0 | -3.0 | -1.0 | **-5.0** |

**Contract tier multipliers** on `closed_won`: monthly (1.0x), 6-month (2.0x), annual (3.0x).

This creates natural tension: Sales wants to close fast, Dev wants to ship stable, Content wants to nurture, and the Customer oracle punishes churn.

### Collaboration Bonus

Detected through two mechanisms:
- **Message-based**: Agent mentions another agent by name (e.g., Marketing says `"dev: align launch with feature ship"`)
- **Target-based**: Agent's `target` references another agent's domain (e.g., Sales targets a feature Dev just shipped)

### Constraint Penalties

- Budget overrun: -1.0
- Invalid action: -1.0
- Stale leads (not contacted >5 days): -0.5 per lead
- Vaporware (content referencing unshipped features): -5.0

---

## Five Adversarial Scenarios

| Scenario | Budget | Traffic | Pressure | Scheduled Events |
|----------|--------|---------|----------|-----------------|
| **Baseline GTM Launch** | $100K | 1,000/day | Low | None — standard playbooks, receptive market |
| **Competitor Launch** | $100K | 800/day | High | Day 3: funding news, Day 7: feature parity, Day 15: poaching attempt, Day 25: PR crisis |
| **Series A Pressure** | $200K | 1,000/day | High | Day 1: board meeting, Day 30: check-in, Day 60: final stretch. Must 3x MRR in 90 days |
| **Churn Spike** | $100K | 1,000/day | Critical | Day 1: warning signs, Day 5: escalation, Day 10: churn begins, Day 20: recovery check |
| **Viral Moment** | $100K | 3,000/day | Chaotic | Day 1: viral tweet, Day 3: lead flood, Day 7: infra strain, Day 15: support overload |

Each scenario modifies initial state (budget, traffic, NPS, stability), injects extra customers/backlog, and fires scheduled events at fixed days. Random events also fire with configurable probability (default 15%/day).

---

## Training Pipeline

```
 ┌──────────────┐     ┌──────────────────┐     ┌─────────────────────┐
 │  Simulation  │────►│  Trajectory       │────►│  Northflank H100    │
 │  Episodes    │     │  Collector        │     │  Training Worker    │
 │  (LLM agents)│     │  (per-role JSONL) │     │                     │
 └──────────────┘     └──────────────────┘     │  TRL GRPO +         │
                                                │  Unsloth LoRA       │
                                                │  Qwen 2.5 14B base  │
                                                └────────┬────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────────┐
                                                │  vLLM Inference     │
                                                │  Hot-loaded LoRA    │
                                                │  adapters per role: │
                                                │                     │
                                                │  office-os-ceo      │
                                                │  office-os-dev      │
                                                │  office-os-marketing│
                                                │  office-os-sales    │
                                                │  office-os-content  │
                                                │  office-os-hr       │
                                                └─────────────────────┘
```

### How It Works

1. **Collect**: During simulation, `TrajectoryCollector` records every agent turn as a `TurnRecord` (system prompt, user message, assistant response, reward, metadata).

2. **Ship**: After each episode, trajectories are saved as JSONL and sent to the Northflank H100 training worker via HTTP.

3. **Train**: The worker runs **GRPO** (Group Relative Policy Optimization) using [TRL](https://github.com/huggingface/trl) + [Unsloth](https://github.com/unslothai/unsloth) for efficient LoRA fine-tuning. Each role gets its own LoRA adapter trained on role-specific reward signals.

4. **Deploy**: Trained LoRA adapters are hot-loaded into vLLM. Subsequent episodes use the fine-tuned models for inference.

5. **Iterate**: The loop repeats across episodes and scenarios, progressively improving agent behavior.

### Training Data Format

```jsonl
{"role": "sales", "system_prompt": "You are the Sales agent...", "user_message": "=== Day 3 | Phase: execution...", "assistant_response": {"action_type": "QUALIFY_LEAD", "target": "Acme Corp", "reasoning": "..."}, "reward": 2.1, "day": 3, "turn": 25}
```

Pre-generated expert trajectories are available in `office_os/training_data/` for bootstrapping.

### Trained Model Weights

Published on Hugging Face: [HarshalH/office-os-loras](https://huggingface.co/HarshalH/office-os-loras)

---

## Frontend

Four visualization modes, all connected via WebSocket for real-time updates:

### 2D Pixel-Art Office (Phaser 3)

- Tiled office layout (40x34 grid, 32px tiles) with labeled rooms
- Animated agent sprites with behavior FSM (IDLE / WORKING / WALKING / COLLABORATING)
- BFS pathfinding on tile grid with smooth movement
- Type-color-coded speech bubbles (blue = reasoning, green = action, orange = chat)
- Animated dashed lines between collaborating agents
- Camera pan/zoom with sprite caching across 6 zoom levels

### 4D Three.js Office (React Three Fiber + Drei)

- 3D office environment with Roblox-style humanoid agents
- Orbital camera controls
- Sidebars with real-time KPIs and agent status
- Timeline scrubber for step-by-step episode replay

### Dashboard (Tabular)

- Real-time KPI charts (traffic, revenue, pipeline value, NPS, team velocity)
- Per-agent reward breakdown with sparklines
- Deal pipeline visualization with stage progression
- Budget tracker and action log

### Playground (Sandbox)

- Manual agent action submission for testing
- Real-time response inspection
- Useful for debugging individual agent behavior

---

## Supported Models

Switch models at runtime via the frontend model selector. Changes take effect on the next episode reset.

| Model | Badge | Provider | Notes |
|-------|-------|----------|-------|
| Claude Haiku 4.5 | DEFAULT | Anthropic / Bedrock | Fast, cheap — good for rapid iteration |
| Claude Sonnet 4.6 | BALANCED | Anthropic / Bedrock | Best quality/cost tradeoff |
| Claude Opus 4.6 | APEX | Anthropic / Bedrock | Highest reasoning quality |
| **Qwen 2.5 14B (Trained)** | **TRAINED** | **vLLM (Northflank)** | **GRPO fine-tuned with per-role LoRA adapters** |
| Qwen3 80B | NEW | Bedrock | Large open model |
| Llama 3.3 70B | OPEN | Bedrock | Meta's open model |
| Ministral 3 14B | EU | Bedrock | Mistral's efficient model |
| Gemma 3 4B | OPEN | Bedrock | Google's small model |
| MiniMax M2 | NEW | Bedrock | MiniMax's latest |
| GPT OSS 120B | OPEN | Bedrock | OpenAI's open model |

---

## API Reference

### REST Endpoints (port 8080)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Server health check |
| `GET` | `/api/config` | Current model, provider, and mode |
| `GET` | `/api/state` | Full environment state snapshot |
| `GET` | `/api/metrics` | KPI history for the current episode |
| `GET` | `/api/conversations` | Agent conversation log |
| `GET` | `/api/training-status` | Training mode status (trajectory counts) |
| `POST` | `/api/reset` | Start a new episode, returns initial state |
| `POST` | `/api/step` | Execute one agent turn, returns observation + reward |
| `POST` | `/api/reconfigure` | Hot-swap model/provider/mode (takes effect on reset) |
| `POST` | `/api/validate-rubric` | Stream Claude Opus 4.6 validation of reward function (SSE) |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `WS /ws/live` | Real-time state sync — broadcasts after every step |

### Reconfigure Payload

```json
{
  "model": "Qwen/Qwen2.5-14B-Instruct",
  "provider": "art",
  "mode": "inference"
}
```

Providers: `bedrock` (Claude + open models on AWS), `art` (vLLM/OpenAI-compatible endpoint).
Modes: `llm` (default), `training` (collect trajectories), `inference` (use trained LoRA adapters).

---

## Project Structure

```
SuperOffice_env/
│
├── office_os/                              # Core RL environment
│   ├── server/
│   │   ├── office_os_environment.py       # OfficeOsEnvironment (reset/step/state)
│   │   └── app.py                         # Standalone OpenEnv server
│   ├── agents/
│   │   ├── base_agent.py                  # Smallville-style agent (memory + reflection)
│   │   ├── llm_agent.py                   # LLM agent (Claude / Bedrock / vLLM)
│   │   ├── memory.py                      # MemoryStream (200 entries, recency + importance)
│   │   └── prompts.py                     # Role-specific system prompts
│   ├── market/
│   │   ├── config.py                      # Constants: stages, roles, actions, rewards, costs
│   │   ├── state.py                       # MarketState, Customer, Feature, ContentPiece
│   │   ├── simulator.py                   # MarketSimulator (action execution engine)
│   │   ├── events.py                      # EventEngine (scheduled + random market events)
│   │   ├── metrics.py                     # RewardCalculator (6-component composite)
│   │   └── scenarios.py                   # 5 adversarial scenarios with event schedules
│   ├── training/
│   │   ├── collector.py                   # TrajectoryCollector (per-role JSONL records)
│   │   ├── trainer.py                     # RemoteTrainer (sends to Northflank H100)
│   │   └── train_worker.py               # Training worker (TRL GRPO + Unsloth LoRA)
│   ├── integrations/
│   │   └── sheets.py                      # Google Sheets live dashboard sync
│   ├── training_data/                     # Expert trajectories + episode data (JSONL)
│   ├── models.py                          # OfficeOsAction / OfficeOsObservation (Pydantic)
│   ├── run_agents.py                      # CLI runner for headless episodes
│   ├── train_loop.py                      # Full training loop (N episodes x 5 scenarios)
│   ├── demo_inference.py                  # Inference mode demo script
│   └── openenv.yaml                       # OpenEnv environment descriptor
│
├── demo/                                   # Full-stack web demo
│   ├── package.json                       # npm scripts: start, BE_LLM, BE_TRAINED, BE_ART
│   ├── api/
│   │   ├── server.py                      # FastAPI app (Uvicorn, CORS, config)
│   │   ├── routes.py                      # REST + WebSocket endpoints
│   │   ├── rl_bridge.py                   # Bridge: Env + 7 LLMAgents + collab detection
│   │   └── claude_bridge.py               # Anthropic / Bedrock model routing
│   └── frontend/
│       └── src/
│           ├── App.tsx                    # Main layout, view switching
│           ├── store/useStore.ts          # Zustand global state
│           ├── game/                      # Phaser 2D scene engine
│           │   ├── OfficeScene.ts         # Tilemap, agent sprites, camera
│           │   ├── agentBehavior.ts       # Agent FSM (IDLE/WORKING/WALKING/COLLAB)
│           │   ├── pathfinding.ts         # BFS tile-based pathfinder
│           │   ├── speechBubbles.ts       # Type-coded speech bubbles
│           │   └── collaborationVisuals.ts # Animated connection lines
│           └── components/
│               ├── fourd/                 # Three.js 3D view
│               │   ├── FourDView.tsx      # 4D layout with sidebars
│               │   ├── Office3D.tsx       # 3D office + humanoid agents
│               │   └── TimelineScrubber.tsx # Step-by-step replay
│               ├── ModelSelector.tsx       # Hot-swap LLM model selector
│               ├── EpisodeControls.tsx     # Play / Pause / Step / Reset
│               ├── RewardPanel.tsx         # Per-agent reward charts
│               ├── BenchmarkPanel.tsx      # Cross-model leaderboard
│               ├── ConversationLog.tsx     # Real-time agent messages
│               └── MarketDashboard.tsx     # KPI charts + pipeline
│
├── docs/                                   # Extended documentation
│   ├── Idea.md                            # Original concept
│   ├── MarketVille_PRD.md                 # Full product requirements document
│   └── TECHNICAL.md                       # Technical deep-dive
│
├── requirements.txt                        # Python dependencies
├── pyproject.toml                          # Project metadata
└── main.py                                 # Entry point
```

---

## Configuration

### Environment Variables

Create a `.env` file at the project root:

```bash
# LLM Provider (pick one or both)
AWS_ACCESS_KEY_ID=your_key              # For Bedrock models
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
ANTHROPIC_API_KEY=your_key              # For direct Anthropic API

# Training Infrastructure (optional — for GRPO training)
NORTHFLANK_INFERENCE_ENDPOINT=https://your-vllm-endpoint
NORTHFLANK_TRAIN_ENDPOINT=https://your-training-endpoint

# Google Sheets Integration (optional — for live dashboards)
GOOGLE_SHEETS_CREDENTIALS=/path/to/service-account.json
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id
```

### Market Configuration

Key constants in `office_os/market/config.py`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `EPISODE_DAYS` | 30 | Days per episode |
| `TURNS_PER_DAY` | 14 | Agent turns per day (7 agents x 2 rounds) |
| `INITIAL_BUDGET` | $100,000 | Starting company budget |
| `INITIAL_TRAFFIC` | 1,000 | Daily website visitors |
| `INITIAL_CONVERSION` | 2% | Visitor-to-lead conversion rate |
| `EVENT_PROBABILITY` | 15% | Chance of random event per day |
| `LEAD_DECAY_DAYS` | 5 | Days before uncontacted leads go stale |
| `CAMPAIGN_COST` | $500 | Cost per marketing campaign |
| `AD_COST` | $300 | Cost per ad run |
| `CONTRACTOR_COST` | $1,000 | Cost to hire a contractor |
| `BUILD_FEATURE_TURNS` | 3 | Turns to build a feature |
| `FIX_BUG_TURNS` | 2 | Turns to fix a bug |

### Day Structure

Each simulation day has 14 turns across 4 phases:

| Phase | Turns | Purpose |
|-------|-------|---------|
| `morning_standup` | 3 | Agents share status, CEO sets direction |
| `execution` | 8 | Primary work phase — features, campaigns, deals |
| `review` | 2 | Event engine fires, progress evaluation |
| `planning` | 1 | Next-day preparation |

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Asymmetric observations** | Each agent sees only role-relevant KPIs and context, not the full state — forcing information sharing through messages |
| **Token-aware pruning** | Prompt sections prioritized P0-P8; lowest-priority sections dropped to fit model context windows |
| **Collaboration as emergent behavior** | No explicit coordination protocol — agents learn to collaborate through reward signals and message passing |
| **Smallville-style memory** | Agents maintain observation streams, form reflections, and create plans — providing continuity across turns |
| **Composite reward shaping** | 6-component reward ensures gradient signal even on "maintenance" turns (base +0.1 for successful actions) |
| **Per-role LoRA adapters** | Each role gets its own fine-tuned adapter, allowing role-specific optimization without catastrophic forgetting |
| **Adversarial scenarios** | Scheduled events at fixed days create reproducible stress tests for comparing agent strategies across models |
| **Hot-swappable models** | Runtime model switching via the frontend allows A/B comparison between foundation models and trained adapters |

---

## Research Inspirations

- **[Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2304.03442)** (Park et al., 2023) — Smallville memory streams, reflection, planning
- **[Social Simulacra: Creating Populated Prototypes for Social Computing Systems](https://arxiv.org/abs/2208.04024)** (Park et al., 2022) — Multi-agent social systems
- **[AgentSociety: Large-Scale Simulation of LLM-Based Human Behaviors](https://arxiv.org/abs/2502.08691)** (Piao et al., 2025) — LLM-based human behavior simulation at scale
- **[OpenEnv](https://github.com/meta-pytorch/OpenEnv)** — Meta's Gymnasium-compatible environment framework

### Trained Model Weights

- **Hugging Face**: [HarshalH/office-os-loras](https://huggingface.co/HarshalH/office-os-loras)

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run tests: `cd office_os && pytest tests/`
5. Commit with a descriptive message
6. Push and open a pull request

### Areas We'd Love Help With

- New adversarial scenarios (economic downturn, M&A, product pivot)
- Additional agent roles (Legal, Finance, Support)
- Alternative training algorithms (PPO, DPO, REINFORCE)
- Improved reward calibration and multi-agent credit assignment
- Better frontier model benchmarking across scenarios
- Integration with additional LLM providers

---

## License

BSD-3-Clause. See [LICENSE](LICENSE) for details.

---

<div align="center">

**Built for the OpenEnv Hackathon 2026 — Meta PyTorch Team**

*An environment where multi-agent, multi-role collaboration is not simulated in abstraction — it is grounded in the exact pressures, handoffs, and tradeoffs that define organizational decision-making.*

</div>
