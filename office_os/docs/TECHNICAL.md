# O2 Office OS — Technical Deep Dive

> **7 LLM agents. 1 startup. 30 simulated days. Reinforcement learning from group policy optimization.**

---

## The Big Picture (1-Minute Version)

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │                        OFFICE OS PIPELINE                          │
 │                                                                    │
 │   ┌──────────┐    ┌──────────────┐    ┌───────────┐    ┌────────┐ │
 │   │ OpenEnv  │───▶│ 7 LLM Agents │───▶│  GRPO     │───▶│ Deploy │ │
 │   │ Gym Env  │    │ + Shared Mem │    │  Training  │    │ LoRA   │ │
 │   └──────────┘    └──────────────┘    └───────────┘    └────────┘ │
 │    Simulator        Claude/Qwen       Unsloth + TRL    vLLM + HF  │
 │                                       on Northflank    Hot-reload  │
 │                                                                    │
 │   Tracked on: Weights & Biases  │  Published to: HuggingFace      │
 └─────────────────────────────────────────────────────────────────────┘
```

**In one sentence:** We built a multi-agent reinforcement learning environment where 7 AI agents run a SaaS startup, learn from simulated market outcomes via GRPO, and continuously improve through LoRA fine-tuning on Northflank H100 GPUs.

---

## 1. OpenEnv Integration

Office OS is built on Meta's **OpenEnv** framework — we implement the standard `Environment` interface so any OpenEnv-compatible agent can plug in.

```python
# server/office_os_environment.py
from openenv.core.env_server.interfaces import Environment
from openenv.core.env_server.types import State

class OfficeOsEnvironment(Environment):
    def reset(self) -> OfficeOsObservation:   # Initialize 30-day episode
    def step(self, action) -> OfficeOsObservation:  # Execute agent action
    def state(self) -> State:                  # Current market snapshot
```

```python
# server/app.py — OpenEnv HTTP server
from openenv.core.env_server.http_server import create_app

app = create_app(
    OfficeOsEnvironment,
    OfficeOsAction,
    OfficeOsObservation,
    env_name="office_os",
    max_concurrent_envs=1,
)
```

**Endpoints exposed:** `POST /reset`, `POST /step`, `GET /state`, `GET /schema`, `WS /ws`

---

## 2. Environment Architecture

### How the Simulation Works

Each episode = **30 days × 14 turns/day = 420 agent decisions per episode**.

7 agents take turns each day across 4 phases:

| Phase | Turns | What Happens |
|-------|-------|--------------|
| Morning Standup | 3 | Agents read shared memory, align priorities |
| Execution | 8 | Core work: build features, run demos, write content |
| Review | 2 | Evaluate progress, collect feedback |
| Planning | 1 | Set next-day priorities |

### The 7 Agents and Their Tools

| Agent | Role | Key Actions (Tools) |
|-------|------|---------------------|
| **Jeeya (CEO)** | Strategy & budget | `SET_OKRS`, `ALLOCATE_BUDGET`, `PIVOT`, `SEND_DIRECTIVE`, `APPROVE_INITIATIVE` |
| **Alex (Dev)** | Engineering | `BUILD_FEATURE`, `FIX_BUG`, `SHIP_RELEASE`, `REFACTOR`, `WRITE_DOCS`, `REVIEW_PR` |
| **Jordan (Marketing)** | Growth | `LAUNCH_CAMPAIGN`, `RUN_AD`, `RESEARCH_MARKET`, `OPTIMIZE_FUNNEL`, `A_B_TEST` |
| **Sam (Sales)** | Revenue | `QUALIFY_LEAD`, `RUN_DEMO`, `SEND_PROPOSAL`, `CLOSE_DEAL`, `FOLLOW_UP`, `UPDATE_SHEET` |
| **Casey (Content)** | Content | `WRITE_BLOG`, `WRITE_CASE_STUDY`, `WRITE_SOCIAL_POST`, `WRITE_EMAIL_SEQUENCE` |
| **Pat (HR)** | Operations | `PLAN_SPRINT`, `TRACK_OKRS`, `RESOLVE_BLOCKER`, `HIRE_CONTRACTOR` |
| **Customer** | External pressure | `EVALUATE_PRODUCT`, `REQUEST_FEATURE`, `ESCALATE_ISSUE`, `RENEW_CONTRACT` |

Each action modifies the `MarketState` — customers move through pipeline, features get built, revenue flows in, KPIs shift.

### Data Points Simulated

| Metric | Value |
|--------|-------|
| Turns per episode | **420** (30 days × 14 turns) |
| Training episodes | **10** (configurable, across 5 scenarios) |
| Total agent decisions | **4,200** per training run |
| Trajectories per role | **~600** (420 turns ÷ 7 agents × 10 episodes) |
| Scenarios stress-tested | **5** (Baseline, Competitor Launch, Series A, Churn Spike, Viral Moment) |
| Pipeline stages tracked | **9** (visitor → lead → qualified → demo → proposal → negotiation → closed_won/lost/churned) |
| KPIs tracked per turn | **12+** (revenue, MRR, traffic, conversion, pipeline, stability, NPS, satisfaction, etc.) |

---

## 3. Shared Memory — How Agents Coordinate

Agents coordinate through a **three-layer communication system** — no centralized controller, no pre-defined workflows.

```
┌─────────────────────────────────────────────────────────────┐
│                   COORDINATION LAYERS                       │
│                                                             │
│  Layer 1: SHARED TEAM MEMORY (append-only ledger)           │
│  ├─ Auto-posts when agents ship, close deals, publish       │
│  ├─ All agents read last 15 entries                         │
│  └─ Types: "update", "alert", "insight", "message"          │
│                                                             │
│  Layer 2: DIRECT MESSAGES (agent-to-agent)                  │
│  ├─ Format: "dev: SSO shipped, show to Acme"                │
│  ├─ Visible to all agents in next turn                      │
│  └─ Auto-posted to shared memory too                        │
│                                                             │
│  Layer 3: INDIVIDUAL MEMORY STREAMS (Smallville-style)      │
│  ├─ Observations (importance: 5.0) — raw facts              │
│  ├─ Reflections (importance: 8.0) — synthesized insights    │
│  └─ Plans (importance: 7.0) — intended next actions         │
│  └─ Retrieved by: recency × importance scoring              │
│                                                             │
│  Layer 4: ASYMMETRIC OBSERVATIONS                           │
│  ├─ Dev sees: backlog, bugs, features in progress           │
│  ├─ Sales sees: full pipeline, customer details             │
│  ├─ All see: KPIs (role-scoped), team status, events        │
│  └─ Nobody sees everything — forces communication           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Example coordination flow:**
1. Dev ships SSO → auto-posted to shared memory: `"SHIPPED: SSO Integration"`
2. Sales reads shared memory → runs demo with Acme → sends message: `"dev: Acme wants API integrations"`
3. Dev reads message → prioritizes API feature → Content writes case study about SSO
4. Marketing amplifies the case study → more leads enter pipeline

Each of these interactions generates **trajectory data** with rewards — the RL signal that teaches agents to collaborate.

---

## 4. Training Pipeline — Unsloth + TRL on Northflank H100

### Architecture

```
┌─ Northflank H100 GPU Instance ─────────────────────────────┐
│                                                             │
│  ┌─────────────────┐   ┌──────────────────┐   ┌─────────┐ │
│  │  vLLM Server    │   │  Training Worker │   │ Jupyter  │ │
│  │  Port 8080      │   │  Port 8081       │   │ Port 8888│ │
│  │                 │   │                  │   │          │ │
│  │  Qwen 2.5 14B  │◀──│  Unsloth + TRL   │   │ Notebook │ │
│  │  + LoRA hot-    │   │  GRPO Trainer    │   │ Demo     │ │
│  │    reload       │   │                  │   │          │ │
│  └────────▲────────┘   └────────▲─────────┘   └──────────┘ │
│           │                     │                           │
└───────────┼─────────────────────┼───────────────────────────┘
            │                     │
     Inference requests     POST /train
     from agents            (trajectories)
            │                     │
┌───────────┴─────────────────────┴───────────────────────────┐
│  Simulation Host (local or cloud)                           │
│  train_loop.py → runs episodes → collects trajectories      │
│                → sends to worker → agents use trained LoRA   │
└─────────────────────────────────────────────────────────────┘
```

### Step 1: Model Loading with Unsloth

```python
# training/train_worker.py
from unsloth import FastLanguageModel

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="Qwen/Qwen2.5-14B-Instruct",
    max_seq_length=4096,
    load_in_4bit=True,          # 4-bit QLoRA — fits 14B in ~12GB VRAM
)

model = FastLanguageModel.get_peft_model(
    model,
    r=32,                        # LoRA rank
    lora_alpha=32,               # Scaling factor (alpha/rank = 1.0)
    target_modules=[             # All attention + MLP layers
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ],
    use_gradient_checkpointing="unsloth",  # Unsloth-optimized checkpointing
    random_state=3407,
)
```

**Why Unsloth?** — 2x faster training, 60% less VRAM. Fits Qwen 2.5 14B on a single H100 with room for GRPO's 4 generations per prompt.

### Step 2: GRPO Training with TRL

```python
from trl import GRPOConfig, GRPOTrainer

training_args = GRPOConfig(
    num_generations=4,              # Generate 4 completions per prompt
    max_prompt_length=3072,         # Input token budget
    max_completion_length=1024,     # Output token budget
    temperature=0.9,                # High diversity for exploration
    learning_rate=2e-5,
    per_device_train_batch_size=1,
    gradient_accumulation_steps=4,  # Effective batch size = 4
    num_train_epochs=3,
    max_steps=50,                   # Prevent overfitting on small datasets
    bf16=True,                      # BFloat16 precision
    optim="adamw_8bit",             # Memory-efficient optimizer
)

trainer = GRPOTrainer(
    model=model,
    args=training_args,
    train_dataset=dataset,          # Trajectories from simulation
    reward_funcs=[                  # Dual reward signal
        score_completion,           # Format + validity (deterministic)
        llm_judge_reward,           # Strategic quality (LLM-as-a-judge)
    ],
    tokenizer=tokenizer,
)
trainer.train()
```

**How GRPO works:** For each trajectory prompt, generate 4 completions → score them → completions above group mean are reinforced, below-mean are suppressed. No value network needed (unlike PPO).

### Step 3: Training Data Format

Each trajectory collected during simulation becomes a training example:

```python
# Trajectory → GRPO dataset row
{
    "prompt": [
        {"role": "system", "content": "You are the Head of Engineering..."},
        {"role": "user", "content": "Day 5 | Phase: execution\nKPIs:\n  Revenue: $0\n  Pipeline: $45,000\n  Features shipped: 0\n..."},
    ],
    "expected_action": '{"action_type": "BUILD_FEATURE", "target": "SSO", ...}',
    "trajectory_reward": 0.8,
}
```

### Step 4: LoRA Hot-Reload into vLLM

After training, the adapter is loaded into vLLM **without restarting** the server:

```python
# Save adapter
model.save_pretrained(f"/tmp/office_os_lora/{role}/adapter")

# Hot-load into running vLLM
requests.post(f"{vllm_url}/v1/load_lora_adapter", json={
    "lora_name": f"office-os-{role}",
    "lora_path": adapter_path,
})
```

Next episode, the agent uses its trained LoRA — performance improves iteratively.

---

## 5. vLLM Serving Configuration

```bash
# training/start_vllm.sh
VLLM_ALLOW_RUNTIME_LORA_UPDATING=True \
python -m vllm.entrypoints.openai.api_server \
    --model "Qwen/Qwen2.5-14B-Instruct" \
    --port 8080 \
    --enable-lora \
    --max-loras 2 \
    --max-lora-rank 32 \
    --gpu-memory-utilization 0.6 \
    --max-model-len 4096 \
    --enforce-eager
```

| Flag | Purpose |
|------|---------|
| `--enable-lora` | Activate LoRA adapter support |
| `--max-loras 2` | Hot-swap up to 2 adapters simultaneously |
| `VLLM_ALLOW_RUNTIME_LORA_UPDATING` | Enable hot-loading without restart |
| `--gpu-memory-utilization 0.6` | Reserve 40% VRAM for training worker |

Agents call vLLM using OpenAI-compatible API:
```python
client = OpenAI(base_url="http://northflank:8080/v1", api_key="dummy")
response = client.chat.completions.create(
    model="office-os-dev",  # LoRA adapter name
    messages=[...],
    max_tokens=512,
    temperature=0.7,
)
```

---

## 6. Monitoring & Model Publishing

### Weights & Biases — Training Metrics

Every GRPO training run logs to W&B:

- **Loss curves** per role (CEO, Dev, Marketing, Sales, Content, HR)
- **Reward distributions** — format score + LLM judge score per generation
- **Gradient norms** — detect training instability
- **Learning rate schedule**
- **GPU utilization and memory**

Set `WANDB_API_KEY` and training auto-logs with run names like `dev-step1`, `sales-step2`.

### HuggingFace — Model Publishing

After training, LoRA adapters are pushed to HuggingFace:

```python
# Automatic push after each training round
model.push_to_hub(f"{HF_REPO}/office-os-{role}")
tokenizer.push_to_hub(f"{HF_REPO}/office-os-{role}")
```

Each role gets its own adapter: `youruser/office-os-dev`, `youruser/office-os-sales`, etc.

Set `HF_TOKEN` and `HF_REPO` environment variables.

### Northflank H100 — GPU Infrastructure

| Component | Spec |
|-----------|------|
| **GPU** | 1× NVIDIA H100 (80GB VRAM) |
| **Base Image** | `pytorch/pytorch:2.8.0-cuda12.6-cudnn9-runtime` |
| **Services** | vLLM (8080) + Training Worker (8081) + Jupyter (8888) |
| **Storage** | Ephemeral — adapters pushed to HuggingFace for persistence |

**Environment Variables (Northflank):**

| Variable | Purpose |
|----------|---------|
| `BASE_MODEL` | Qwen/Qwen2.5-14B-Instruct (default) |
| `HF_TOKEN` | HuggingFace model access + push |
| `HF_REPO` | Target repo for LoRA adapters |
| `WANDB_API_KEY` | Training metric logging |
| `JUDGE_PROVIDER` | Reward judge: `bedrock` / `anthropic` / `vllm` |
| `AWS_ACCESS_KEY_ID` | For Bedrock LLM judge |
| `AWS_SECRET_ACCESS_KEY` | For Bedrock LLM judge |

---

## 7. End-to-End Training Loop

```
Episode 1                          Episode 2                    Episode N
─────────                          ─────────                    ─────────
Agents use base Qwen 2.5    →     Agents use trained LoRAs  →  Continuously
420 turns × 7 agents               Better decisions              improving
Trajectories collected              Higher rewards
        │                                  │
        ▼                                  ▼
   POST /train                        POST /train
   to Northflank                      to Northflank
        │                                  │
        ▼                                  ▼
┌─────────────────┐              ┌─────────────────┐
│ For each role:  │              │ For each role:  │
│ 1. Load Unsloth │              │ 1. Load model   │
│ 2. Build dataset│              │ 2. Train GRPO   │
│ 3. GRPO train   │              │ 3. Hot-reload   │
│ 4. Save LoRA    │              │ 4. Push to HF   │
│ 5. Hot-load     │              │ 5. Log to W&B   │
│ 6. Push to HF   │              └─────────────────┘
│ 7. Log to W&B   │
└─────────────────┘

10 episodes × 420 turns = 4,200 agent decisions trained on
```

---

## 8. Tech Stack Summary

| Layer | Technology | Role |
|-------|-----------|------|
| **Environment** | OpenEnv + FastAPI + WebSocket | Gym-style reset/step interface |
| **Simulation** | Custom MarketSimulator | 9-stage pipeline, KPIs, events |
| **Agents** | LLMAgent + Smallville Memory | Observe → Retrieve → Decide → Reflect |
| **Inference** | vLLM (Qwen 2.5 14B) | OpenAI-compatible API, LoRA hot-swap |
| **Fallback** | Claude (Anthropic/Bedrock) | Development mode, LLM-as-a-judge |
| **Training** | Unsloth + TRL GRPOTrainer | 4-bit QLoRA, GRPO policy optimization |
| **GPU** | Northflank H100 | Training worker + vLLM serving |
| **Monitoring** | Weights & Biases | Loss, rewards, gradients per role |
| **Model Registry** | HuggingFace Hub | LoRA adapter publishing per role |
| **Live Dashboard** | Google Sheets (optional) | Real-time KPI + pipeline sync |
| **Memory** | Shared Board + Individual Streams | Multi-layer coordination without central control |

---

## Quick Start Commands

```bash
# Terminal 1: Start vLLM on Northflank H100
bash office_os/training/start_vllm.sh

# Terminal 2: Start GRPO training worker
bash office_os/training/start_train_worker.sh

# Terminal 3: Run full training loop (10 episodes)
python office_os/train_loop.py \
  --episodes 10 \
  --northflank-endpoint http://localhost:8080 \
  --learning-rate 2e-5

# Or: Train on pre-generated expert data
python office_os/send_training.py \
  --roles dev sales ceo marketing content hr \
  --wandb office-os \
  --hf youruser/office-os-loras
```
