<div align="center">

# O2 OpenOffice

### Multi-Agent Reinforcement Learning Environment for Organizational Decision-Making

**Multi-agent. Multi-mind. One office.**

[![Built on OpenEnv](https://img.shields.io/badge/Built%20on-OpenEnv-blue)](https://github.com/meta-pytorch/OpenEnv)
[![Python 3.9+](https://img.shields.io/badge/Python-3.9%2B-green)](https://python.org)
[![React + Phaser](https://img.shields.io/badge/Frontend-React%20%2B%20Phaser%20%2B%20Three.js-61DAFB)](https://reactjs.org)
[![License: BSD-3](https://img.shields.io/badge/License-BSD--3-orange)](LICENSE)

</div>

---

## The Problem

Training intelligent systems to operate in real organizations requires environments where multiple agents interact, compete, and collaborate under realistic social and strategic pressure. Existing RL setups fall short — they lack the organizational complexity, role-based coordination, and dynamic market conditions that define how real companies actually operate.

## The Solution

A multi-agent reinforcement learning environment modeled on a real startup's go-to-market motion. The "world" is a startup office; the agents are its people: **CEO, Marketing, Sales, Dev, HR, Content, and a Customer reward oracle**. Each agent observes its local state, takes actions, receives a reward signal, and learns optimal behavior across episodes while coordinating with every other agent in the system.

Five adversarial scenarios stress-test the environment: a **Baseline GTM Launch**, **Competitor Launch**, **Series A Pressure**, **Churn Spike**, and **Viral Moment**. Each shifts reward dynamics and forces agents to adapt their coordination strategies in real time.

The result is an environment where multi-agent, multi-role collaboration is not simulated in abstraction — it is grounded in the exact pressures, handoffs, and tradeoffs that define organizational decision-making.

---

## Architecture

```
                                    O2 OpenOffice — System Architecture
 ┌─────────────────────────────────────────────────────────────────────────────────────────┐
 │                                                                                         │
 │   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
 │   │                          FRONTEND  (React + Vite)                               │   │
 │   │                                                                                 │   │
 │   │   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   │   │
 │   │   │  2D Pixel-Art │   │  4D Three.js  │   │  Dashboard   │   │  Playground  │   │   │
 │   │   │  Office Map   │   │  3D Office    │   │  (Tabular)   │   │  (Sandbox)   │   │   │
 │   │   │  (Phaser 3)   │   │  (R3F + Drei) │   │              │   │              │   │   │
 │   │   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   │   │
 │   │          │                   │                   │                  │            │   │
 │   │          └───────────┬───────┴───────────┬───────┘                  │            │   │
 │   │                      │                   │                          │            │   │
 │   │              ┌───────▼───────┐   ┌───────▼───────┐   ┌─────────────▼──────┐    │   │
 │   │              │  Zustand Store │   │  WebSocket    │   │  Reward Panel /    │    │   │
 │   │              │  (State Mgmt)  │   │  (Real-time)  │   │  Benchmark Board   │    │   │
 │   │              └───────┬───────┘   └───────┬───────┘   └────────────────────┘    │   │
 │   └──────────────────────┼───────────────────┼──────────────────────────────────────┘   │
 │                          │                   │                                          │
 │                     REST API            WebSocket                                       │
 │                     /api/*              /ws                                             │
 │                          │                   │                                          │
 │   ┌──────────────────────▼───────────────────▼──────────────────────────────────────┐   │
 │   │                          DEMO API  (FastAPI + Uvicorn)                          │   │
 │   │                                                                                 │   │
 │   │   ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────────────┐   │   │
 │   │   │  routes.py        │   │  rl_bridge.py     │   │  claude_bridge.py        │   │   │
 │   │   │  /api/step        │   │  Wraps Env +      │   │  Anthropic/Bedrock       │   │   │
 │   │   │  /api/reset       │   │  7 LLM Agents     │   │  Model Routing           │   │   │
 │   │   │  /api/state       │   │  Collaboration    │   │                          │   │   │
 │   │   │  /api/reconfigure │   │  Detection        │   │                          │   │   │
 │   │   └──────┬───────────┘   └──────┬───────────┘   └──────────┬───────────────┘   │   │
 │   └──────────┼──────────────────────┼──────────────────────────┼────────────────────┘   │
 │              │                      │                          │                        │
 │   ┌──────────▼──────────────────────▼──────────────────────────▼────────────────────┐   │
 │   │                          OFFICE OS  (Core RL Engine)                            │   │
 │   │                                                                                 │   │
 │   │   ┌─────────────────────────────────────────────────────────────────────────┐   │   │
 │   │   │                      OfficeOsEnvironment                                │   │   │
 │   │   │                  (OpenEnv Gymnasium Interface)                           │   │   │
 │   │   │                                                                         │   │   │
 │   │   │    reset() ──► MarketState.initial(scenario)                            │   │   │
 │   │   │    step(action) ──► MarketSimulator ──► RewardCalculator ──► obs        │   │   │
 │   │   │    state() ──► Full environment snapshot                                │   │   │
 │   │   └─────────────────────────────────────────────────────────────────────────┘   │   │
 │   │                                                                                 │   │
 │   │   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   │   │
 │   │   │  Agents       │   │  Market       │   │  Scenarios   │   │  Training    │   │   │
 │   │   │               │   │               │   │              │   │              │   │   │
 │   │   │  BaseAgent    │   │  MarketState  │   │  Baseline    │   │  GRPO via    │   │   │
 │   │   │  LLMAgent     │   │  Simulator    │   │  Competitor  │   │  TRL +       │   │   │
 │   │   │  MemoryStream │   │  EventEngine  │   │  Series A    │   │  Unsloth     │   │   │
 │   │   │  Prompts      │   │  Metrics      │   │  Churn Spike │   │  LoRA        │   │   │
 │   │   │               │   │  Config       │   │  Viral       │   │  Adapters    │   │   │
 │   │   └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘   │   │
 │   └─────────────────────────────────────────────────────────────────────────────────┘   │
 │                                                                                         │
 │   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
 │   │                          LLM PROVIDERS  (Pluggable)                             │   │
 │   │                                                                                 │   │
 │   │   Claude Haiku 4.5 ─── Claude Sonnet 4.6 ─── Claude Opus 4.6                   │   │
 │   │   Llama 3.3 70B ────── Qwen3 80B ──────────── Ministral 14B                    │   │
 │   │   Gemma 3 4B ────────── MiniMax M2 ──────────── GPT OSS 120B                   │   │
 │   │                                                                                 │   │
 │   │   Routing: Anthropic Messages API  |  AWS Bedrock Converse API                  │   │
 │   └─────────────────────────────────────────────────────────────────────────────────┘   │
 │                                                                                         │
 └─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Agent Decision Flow

```
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                     PER-TURN AGENT DECISION LOOP                       │
 └─────────────────────────────────────────────────────────────────────────┘

                          ┌──────────────┐
                          │  Environment │
                          │    State     │
                          └──────┬───────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Build Observation     │
                    │   (role-scoped KPIs,    │
                    │    messages, events,    │
                    │    pipeline, memory)    │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Token-Aware Pruning   │
                    │   Priority P0-P8        │
                    │   (budget-fit prompt)   │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   LLM Agent Decides     │
                    │                         │
                    │   Input: System Prompt  │
                    │        + Observation    │
                    │                         │
                    │   Output: AgentAction   │
                    │     {action_type,       │
                    │      target,            │
                    │      parameters,        │
                    │      reasoning,         │
                    │      message}           │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Validate Action       │
                    │   (role-allowed only,   │
                    │    reject & penalize    │
                    │    invalid actions)     │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                   │
     ┌────────▼────────┐ ┌──────▼───────┐ ┌────────▼────────┐
     │  Market Sim      │ │  Event       │ │  Collaboration  │
     │  Execute Action  │ │  Engine      │ │  Detection      │
     │  Update State    │ │  Fire Events │ │  (mentions +    │
     │  Move Pipeline   │ │  Apply Mods  │ │   targets)      │
     └────────┬────────┘ └──────┬───────┘ └────────┬────────┘
              │                  │                   │
              └──────────────────┼───────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Reward Calculator     │
                    │                         │
                    │   R = pipeline_stage    │
                    │     + kpi_delta         │
                    │     + action_reward     │
                    │     + collab_bonus      │
                    │     - constraint_pen    │
                    │     + base_shaping      │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Update Memory Stream  │
                    │   Reflect + Plan        │
                    │   Broadcast to Frontend │
                    └─────────────────────────┘
```

---

## Episode Lifecycle

```
 Episode Start                                                       Episode End
     │                                                                    │
     ▼                                                                    ▼
 ┌───────┐    ┌─────────────────────────────────────────────┐       ┌─────────┐
 │ RESET │───►│              SIMULATION LOOP                │──────►│  DONE   │
 │       │    │                                             │       │         │
 └───────┘    │  For each day (1..30):                      │       │ Collect │
              │    ┌─────────────────────────────────────┐  │       │ Traject │
              │    │  MORNING STANDUP                     │  │       │ ories   │
              │    │  All agents gather, share status     │  │       │         │
              │    └──────────────┬──────────────────────┘  │       │ GRPO    │
              │                   │                         │       │ Train   │
              │    ┌──────────────▼──────────────────────┐  │       │ (async) │
              │    │  EXECUTION  (4 turns per day)       │  │       └─────────┘
              │    │                                     │  │
              │    │  CEO ──► Dev ──► Marketing ──►      │  │
              │    │  Sales ──► Content ──► HR ──►       │  │
              │    │  Customer Oracle                    │  │
              │    │                                     │  │
              │    │  Each agent: observe → decide → act │  │
              │    └──────────────┬──────────────────────┘  │
              │                   │                         │
              │    ┌──────────────▼──────────────────────┐  │
              │    │  REVIEW                             │  │
              │    │  EventEngine fires scheduled +      │  │
              │    │  random events, day advances        │  │
              │    └────────────────────────────────────┘  │
              └─────────────────────────────────────────────┘
```

---

## Seven Agents, Seven Roles

| Agent | Role | Key Actions | Reward Drivers |
|-------|------|-------------|----------------|
| **CEO** | Strategic direction | `SET_OKRS`, `ALLOCATE_BUDGET`, `PIVOT`, `SEND_DIRECTIVE` | Closed deals (+5), churned customers (-3), budget efficiency |
| **Dev** | Product engineering | `BUILD_FEATURE`, `FIX_BUG`, `SHIP_RELEASE`, `REFACTOR` | Feature ships (+3), demos (+1), stability, churn (-5) |
| **Marketing** | Demand generation | `LAUNCH_CAMPAIGN`, `RUN_AD`, `RESEARCH_MARKET`, `A_B_TEST` | Leads (+1.5), closed deals (+3), funnel optimization |
| **Sales** | Revenue closure | `QUALIFY_LEAD`, `RUN_DEMO`, `SEND_PROPOSAL`, `CLOSE_DEAL` | Pipeline progression, closed deals (+10), lost deals (-3) |
| **Content** | Thought leadership | `WRITE_BLOG`, `WRITE_CASE_STUDY`, `WRITE_EMAIL_SEQUENCE` | Visitor traffic (+0.5), leads (+1), closed deals (+2) |
| **HR** | Operations & planning | `PLAN_SPRINT`, `TRACK_OKRS`, `RESOLVE_BLOCKER`, `HIRE_CONTRACTOR` | Team efficiency, blocker resolution, OKR tracking |
| **Customer** | Reward oracle | `FILE_BUG`, `REQUEST_FEATURE`, `ESCALATE`, `EXPAND_CONTRACT` | NPS, satisfaction, expansion revenue, churn signals |

---

## Reward Function

The reward signal is a **composite function** with six components, calculated per-agent per-turn:

```
R(agent, turn) = pipeline_stage_reward      # Customer moves through funnel
               + kpi_delta_reward            # Improvement in role-specific KPIs
               + action_reward               # Direct outcome of action taken
               + collaboration_bonus         # Building on another agent's work
               - constraint_penalties        # Budget overruns, invalid targets
               + base_shaping               # +0.1 for any successful action
```

**Pipeline stage rewards** are asymmetric per role — Sales gets +10 for `closed_won`, Dev gets +2, Content gets +2. Churn penalizes Dev (-5) and Customer (-5) most heavily. This creates natural tension: Sales wants to close fast, Dev wants to ship stable, Content wants to nurture.
# Multi-Agent GTM Simulation

A multi-agent reinforcement learning environment modeled on a real startup's 
go-to-market motion. The world is a startup office. The agents are its people.

---

## Overview

Training intelligent systems to operate in real organizations requires 
environments where multiple agents interact, compete, and collaborate under 
realistic social and strategic pressure. Existing RL setups lack the 
organizational complexity, role-based coordination, and dynamic market 
conditions that define how real companies operate.

This environment simulates a startup office where each agent represents a 
department or role. Agents observe their local state, take actions, receive 
reward signals, and learn optimal behavior across episodes while coordinating 
with every other agent in the system.

*Multi-agent. Multi-mind. One office.*

---

## Agents

| Agent | Role | Key Reward Signals |
|---|---|---|
| CEO | Sets OKRs, allocates budget, decides pivots | Revenue growth, burn rate |
| Planning / HR | Hiring plans, sprint coordination, OKR tracking | Velocity, time-to-hire |
| Marketing | Campaigns, A/B tests, lead generation | MQL volume, CAC |
| Content Builder | SEO, case studies, sales collateral | Organic traffic, inbound leads |
| Dev | Feature shipping, bug fixes, demos | Feature velocity, UX score |
| Sales | Qualify, pitch, close | MRR, win rate, cycle time |
| Scene | Environment orchestrator, scenario injector | Global reward, cooperation score |
| Customer | Reward oracle | Purchase, churn, NPS |

Each agent has five core tasks and four coordination tasks. Agents pass work 
to each other through defined handoff channels. If one agent underperforms, 
downstream agents feel it.

---

## Scenarios

Five adversarial scenarios stress-test the system under different market 
conditions:

- **Baseline GTM Launch** — standard conditions, receptive market, low competition
- **Competitor Launch** — a well-funded rival enters, forcing differentiation and pipeline defense
- **Series A Pressure** — investor demand for 3x MRR in 90 days, pushing all agents into aggressive coordination
- **Churn Spike** — 20% of customers signal intent to leave, requiring urgent product fixes and retention effort
- **Viral Moment** — sudden inbound flood overwhelms Marketing and Sales while Dev must scale fast

Each scenario shifts the reward dynamics and tests whether agents can adapt 
their coordination patterns under pressure.

---

## 🔗 Resources

### Core Documentation
- **Website**: [https://meta-pytorch.github.io/OpenEnv](https://meta-pytorch.github.io/OpenEnv)
- **GitHub Repository**: [https://github.com/meta-pytorch/OpenEnv](https://github.com/meta-pytorch/OpenEnv)
- **PyPI Package**: [https://pypi.org/project/openenv](https://pypi.org/project/openenv)

## Five Adversarial Scenarios

| Scenario | Pressure | What Changes |
|----------|----------|--------------|
| **Baseline GTM Launch** | Low | Standard market. Receptive customers, low competition. Agents follow playbooks. |
| **Competitor Launch** | High | Well-funded rival enters market. Traffic drops 20%. Scheduled events: funding announcement (day 3), feature parity (day 7), poaching attempt (day 15). |
| **Series A Pressure** | High | Board demands aggressive metrics. Tighter budget. Investors watching monthly numbers. |
| **Churn Spike** | Critical | Existing customers leaving. NPS crashes. Forces Dev to stabilize, Sales to retain, Content to rebuild trust. |
| **Viral Moment** | Chaotic | Sudden traffic explosion. Pipeline floods. Tests scaling, prioritization, and resource allocation under abundance. |

Each scenario injects **scheduled events** at specific days and modifies **random event probability**, budget, traffic, and initial customer state.

---

## Collaboration Detection

The environment detects inter-agent collaboration through two mechanisms:

- **Message-based**: Agent mentions another agent by name in their `message` field (e.g., Marketing says "dev: let's align launch timing with the feature ship")
- **Target-based**: Agent's `target` field references another agent's domain (e.g., Sales targets a feature Dev just shipped)

Detected collaborations are surfaced in the frontend as animated dashed lines between agent sprites, with type indicators.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **RL Framework** | Meta OpenEnv (Gymnasium-compatible `step()` / `reset()` / `state()`) |
| **Environment** | Python 3.9+, Pydantic models, async FastAPI server |
| **Agent Brains** | LLM-powered via Anthropic Messages API + AWS Bedrock Converse API |
| **Market Simulation** | Custom MarketState with pipeline stages, KPIs, event engine |
| **Reward Calculation** | Composite reward: pipeline + KPI delta + action + collaboration + shaping |
| **Training** | TRL GRPO + Unsloth LoRA fine-tuning (remote H100 worker) |
| **Memory** | Smallville-style MemoryStream with observations, reflections, plans |
| **Token Management** | tiktoken-based priority pruning (P0-P8 sections, budget-fit prompts) |
| **Frontend — 2D** | Phaser 3 pixel-art office with Tiled JSON maps, agent FSM, speech bubbles |
| **Frontend — 4D** | React Three Fiber + Drei, Roblox-style 3D agents, orbital camera |
| **Frontend — State** | Zustand store, WebSocket real-time sync, timeline scrubber with replay |
| **Frontend — UI** | Tailwind CSS v3, Framer Motion animations, Lucide icons, dark/light mode |

---

## Project Structure

```
SuperOffice_env/
├── office_os/                          # Core RL environment
│   ├── server/
│   │   ├── office_os_environment.py    # OpenEnv Environment (reset/step/state)
│   │   └── app.py                      # Standalone OpenEnv server
│   ├── agents/
│   │   ├── base_agent.py               # Smallville-style agent (memory + reflection)
│   │   ├── llm_agent.py                # LLM-powered agent (Claude/Bedrock routing)
│   │   ├── memory.py                   # MemoryStream (observations, reflections, plans)
│   │   └── prompts.py                  # Role-specific system prompts
│   ├── market/
│   │   ├── state.py                    # MarketState (customers, pipeline, KPIs)
│   │   ├── simulator.py                # MarketSimulator (action execution engine)
│   │   ├── events.py                   # EventEngine (scheduled + random events)
│   │   ├── metrics.py                  # RewardCalculator (6-component reward)
│   │   ├── scenarios.py                # 5 adversarial scenarios
│   │   └── config.py                   # Pipeline stages, role actions, stage rewards
│   ├── training/
│   │   ├── collector.py                # TrajectoryCollector (turn records)
│   │   ├── trainer.py                  # RemoteTrainer (GRPO via Northflank H100)
│   │   └── train_worker.py             # Training worker (TRL + Unsloth + LoRA)
│   ├── integrations/
│   │   └── sheets.py                   # Google Sheets sync for live dashboards
│   ├── models.py                       # OfficeOsAction / OfficeOsObservation (Pydantic)
│   ├── openenv.yaml                    # OpenEnv environment config
│   └── run_agents.py                   # CLI runner for headless episodes
│
├── demo/                               # Full-stack demo application
│   ├── api/
│   │   ├── routes.py                   # FastAPI endpoints (/step, /reset, /state, /ws)
│   │   ├── rl_bridge.py                # Bridge: Env + 7 LLMAgents + collaboration detection
│   │   ├── rl_environment.py           # Lightweight env for demo mode
│   │   ├── claude_bridge.py            # Anthropic/Bedrock model routing
│   │   └── server.py                   # Uvicorn server entry point
│   └── frontend/
│       └── src/
│           ├── App.tsx                 # Main layout with view switching
│           ├── game/
│           │   ├── OfficeScene.ts       # Phaser 2D scene (tilemap, agents, camera)
│           │   ├── officeLayout.ts      # Room centers, tile grid (40x34, 32px)
│           │   ├── agentBehavior.ts     # FSM: IDLE → WORKING → WALKING → COLLABORATING
│           │   ├── speechBubbles.ts     # Fade-in/out speech bubbles with color coding
│           │   ├── pathfinding.ts       # BFS pathfinder on tile grid
│           │   └── visualEffects.ts     # Particles, glows, screen shake
│           ├── components/
│           │   ├── fourd/
│           │   │   ├── FourDView.tsx    # 4D view with sidebars + timeline
│           │   │   ├── Office3D.tsx     # Three.js 3D office with humanoid agents
│           │   │   └── TimelineScrubber.tsx  # Step-by-step replay with phase colors
│           │   ├── EpisodeControls.tsx  # Play/pause/step/reset + model selector
│           │   ├── RewardPanel.tsx      # Per-agent reward breakdown + charts
│           │   ├── ConversationLog.tsx  # Real-time agent message stream
│           │   ├── MarketDashboard.tsx  # KPI dashboard (traffic, pipeline, revenue)
│           │   ├── BenchmarkPanel.tsx   # Model leaderboard across episodes
│           │   └── ModelSelector.tsx    # Hot-swap LLM (9 models supported)
│           ├── store/useStore.ts        # Zustand state management
│           └── hooks/
│               ├── useWebSocket.ts      # Real-time WebSocket sync
│               └── useEffectiveState.ts # Timeline replay state resolution
│
├── docs/                               # Documentation archive
├── examples/                           # Example scripts
└── main.py                             # Project entry point
```

---

## Quick Start

### Prerequisites

- Python 3.9+
- Node.js 18+
- AWS credentials (for Bedrock models) or Anthropic API key

### Setup

```bash
# Clone the repository
git clone https://github.com/bvsbharat/SuperOffice_env.git
cd SuperOffice_env

# Backend
pip install -r requirements.txt
cp .env.example .env  # Add your API keys

# Frontend
cd demo/frontend
npm install
cd ../..
```

### Run

```bash
# Terminal 1: Start the backend API
cd demo/api && python server.py

# Terminal 2: Start the frontend
cd demo/frontend && npm run dev
```

Open `http://localhost:5176` — select a model, hit Play, and watch the agents run.

### Headless Mode (No Frontend)

```bash
# Run a full episode from CLI
python office_os/run_agents.py --scenario baseline --model claude-haiku-4-5
```

---

## Supported Models

Switch models at runtime via the frontend model selector. Takes effect on next episode reset.

| Model | Badge | Provider |
|-------|-------|----------|
| Claude Haiku 4.5 | DEFAULT | Anthropic / Bedrock |
| Claude Sonnet 4.6 | BALANCED | Anthropic / Bedrock |
| Claude Opus 4.6 | APEX | Anthropic / Bedrock |
| Llama 3.3 70B | OPEN | Bedrock |
| Qwen3 80B | NEW | Bedrock |
| Ministral 3 14B | EU | Bedrock |
| Gemma 3 4B | OPEN | Bedrock |
| MiniMax M2 | NEW | Bedrock |
| GPT OSS 120B | OPEN | Bedrock |
### Integrations
- **Hugging Face**: [OpenEnv on Hugging Face]([https://huggingface.co/openenv](https://huggingface.co/HarshalH/office-os-loras))
- **Research & References **:
      - [Generative Agents: Interactive Simulacra of Human Behavior (Park et al., 2023)](arxiv.org/abs/2304.03442)
      - [Social Simulacra: Creating Populated Prototypes for Social Computing Systems (Park et al., 2022)](arxiv.org/abs/2208.04024)
      - [AgentSociety: Large-Scale Simulation of LLM-Based Human Behaviors (Piao et al., 2025)](arxiv.org/abs/2502.08691)
  

## Project Structure
```
.
├── agents/
│   ├── ceo.py
│   ├── planning.py
│   ├── marketing.py
│   ├── content.py
│   ├── dev.py
│   ├── sales.py
│   ├── scene.py
│   └── customer.py
├── envs/
│   └── gtm_env.py          # Core RL environment
├── scenarios/
│   ├── baseline.py
│   ├── competitor_launch.py
│   ├── series_a.py
│   ├── churn_spike.py
│   └── viral_moment.py
├── rewards/
│   └── reward_model.py     # Local + global reward aggregation
├── run.py                  # Entry point
├── config.yaml             # Environment and training config
└── README.md
```

---

## How to Run

**Install dependencies**
```bash
pip install -r requirements.txt
```

**Run a simulation episode**
```bash
python run.py --scenario baseline
```

**Run all scenarios**
```bash
python run.py --scenario all
```

**Configure agents and rewards**

Edit `config.yaml` to adjust agent parameters, reward weights, episode 
length, and scenario conditions before running.

**Output**

## Key Design Decisions

- **Asymmetric observations**: Each agent sees only role-relevant KPIs and context, not the full state
- **Token-aware pruning**: Prompt sections are prioritized P0-P8; lowest-priority sections are dropped to fit model context windows
- **Collaboration as emergent behavior**: No explicit coordination protocol — agents learn to collaborate through reward signals (collaboration bonus) and message passing
- **Smallville-style memory**: Agents maintain observation streams, form reflections, and create plans — providing continuity across turns
- **Composite reward shaping**: Six-component reward ensures gradient signal even on "maintenance" turns (base +0.1 for successful actions)
- **Adversarial scenarios**: Scheduled events at fixed days create reproducible stress tests for comparing agent strategies across models

---

## Built For

**OpenEnv Hackathon 2026** — Meta PyTorch Team

*An environment where multi-agent, multi-role collaboration is not simulated in abstraction. It is grounded in the exact pressures, handoffs, and tradeoffs that define organizational decision-making.*
Each episode logs agent actions, local rewards, global reward, and 
cooperation score. Results are saved to `/outputs` for replay and analysis.

---

