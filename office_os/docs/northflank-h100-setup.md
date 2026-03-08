# Northflank H100 Setup for GRPO Training

Train 6 custom LoRA adapters (CEO, Dev, Marketing, Sales, Content, HR) on a Northflank H100 GPU using **TRL GRPO + Unsloth**. After training, LoRAs are hot-loaded into vLLM for inference — no container restart needed.

## Architecture

```
 Your Machine (Client)                    Northflank H100 GPU (Server)
 ─────────────────────                    ──────────────────────────────
                                          ┌────────────────────────────┐
  frontend.py                             │  entrypoint.sh             │
  ├── Runs simulation          ────────>  │  ├── vLLM        :8080     │
  ├── Agents call vLLM for inference      │  │   (Qwen2.5-3B + LoRAs)  │
  ├── Collects trajectories    ────────>  │  ├── train_worker :8081     │
  ├── Sends batches every N days          │  │   (TRL GRPO + Unsloth)  │
  └── Logs to terminal                    │  └── Jupyter     :8888     │
                                          └────────────────────────────┘
                                                    │           │
                                                    ▼           ▼
                                              HuggingFace    Weights &
                                              (LoRA push)    Biases (logs)
```

### Services on the H100

| Service | Port | Description |
|---------|------|-------------|
| **vLLM** | 8080 | OpenAI-compatible inference server. Serves base model + hot-loaded LoRA adapters. |
| **Training Worker** | 8081 | Accepts trajectory batches via HTTP, runs GRPO training, saves LoRA, hot-loads into vLLM. |
| **Jupyter** | 8888 | Notebook server for debugging (keeps the container alive). |

All three run from a single **CMD override** entrypoint — no tmux/screen/nohup needed.

---

## Step 1: Create Northflank GPU Service

1. Go to Northflank dashboard > **Create Service** > **Deployment**
2. Docker image: `pytorch/pytorch:2.8.0-cuda12.6-cudnn9-runtime`
3. Resources:
   - **GPU**: 1x NVIDIA H100
   - **CPU**: 8+ vCPU
   - **Memory**: 32GB+
   - **Ephemeral storage**: 20GB+

## Step 2: Set Environment Variables

In Northflank service > **Environment**:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `BASE_MODEL` | No | Base model for training/inference | `Qwen/Qwen2.5-3B-Instruct` (default) |
| `HF_TOKEN` | Yes | HuggingFace token for model access & LoRA push | `hf_xxx` |
| `HF_REPO` | Yes | HuggingFace repo for LoRA checkpoints | `YourUser/office-os-loras` |
| `WANDB_API_KEY` | Yes | Weights & Biases API key | `xxx` |
| `WANDB_PROJECT` | No | W&B project name | `office-os` (default) |

## Step 3: Clone the Repo

SSH into the container (via Northflank web terminal or CLI):

```bash
# Install Northflank CLI (if using local terminal)
npm i -g @northflank/cli
northflank login

# Inside the container:
cd /home/jovyan
git clone https://github.com/bvsbharat/SuperOffice_env.git
```

## Step 4: Set CMD Override (Persistent Entrypoint)

In Northflank service > **Advanced** > **CMD Override**:

- **Command**:
```
bash /home/jovyan/SuperOffice_env/office_os/training/entrypoint.sh
```

This makes all services persistent — they survive SSH disconnects and container restarts. The entrypoint:

1. Pulls latest code (`git pull`)
2. Installs Python dependencies
3. Authenticates HuggingFace and W&B from env vars
4. Sets `PYTHONPATH` so training worker can import `market.config`
5. Starts vLLM on port 8080 (background)
6. Waits for vLLM health check
7. Starts training worker on port 8081 (background)
8. Starts Jupyter on port 8888 (foreground, keeps container alive)

## Step 5: Expose Ports

In Northflank service > **Ports & DNS**:

| Port | Protocol | Public | Purpose |
|------|----------|--------|---------|
| 8080 | HTTP | Yes | vLLM inference endpoint |
| 8081 | HTTP | Yes | Training worker endpoint |
| 8888 | HTTP | Yes | Jupyter notebook (optional) |

Note the generated URLs:
- vLLM: `https://vllm--your-service--xxxx.code.run`
- Training: `https://training--your-service--xxxx.code.run`

## Step 6: Verify Services

Check that both services are healthy:

```bash
# vLLM health
curl https://vllm--your-service--xxxx.code.run/health

# Training worker health
curl https://training--your-service--xxxx.code.run/health
```

Expected training worker response:
```json
{
  "status": "ok",
  "vllm_url": "http://localhost:8080",
  "global_step": 0,
  "train_steps": {"ceo": 0, "dev": 0, "marketing": 0, "sales": 0, "content": 0, "hr": 0},
  "base_model": "Qwen/Qwen2.5-3B-Instruct"
}
```

## Step 7: Run the Simulation (Local Machine)

```bash
cd office_os

# Set endpoints in .env or export:
export NORTHFLANK_INFERENCE_ENDPOINT=https://vllm--your-service--xxxx.code.run
export NORTHFLANK_TRAIN_ENDPOINT=https://training--your-service--xxxx.code.run

# Run simulation with training every 3 days
python frontend.py --days 30 --speed 0.3 --train-every 3 \
    --northflank-endpoint $NORTHFLANK_INFERENCE_ENDPOINT \
    --northflank-train-endpoint $NORTHFLANK_TRAIN_ENDPOINT
```

### What Happens During a Simulation Run

1. **Days 1-2**: Agents call vLLM (base Qwen model) for decisions. Trajectories are collected locally.
2. **Day 3**: Trajectory batch sent to training worker. GRPO trains 6 LoRA adapters (one per role, skipping Customer). LoRAs hot-loaded into vLLM.
3. **Days 4+**: Agents now use vLLM with their role-specific LoRA adapters.
4. **Day 6, 9, 12...**: Retraining with new trajectories. Models improve over time.
5. **Each training run**: LoRA pushed to HuggingFace, metrics logged to W&B.

---

## Manual Operation (Two-Terminal Mode)

If you prefer running services manually instead of the CMD override:

### Terminal 1: vLLM

```bash
cd /home/jovyan/SuperOffice_env/office_os
bash training/start_vllm.sh
```

### Terminal 2: Training Worker

```bash
cd /home/jovyan/SuperOffice_env/office_os
export PYTHONPATH="/home/jovyan/SuperOffice_env/office_os:$PYTHONPATH"
bash training/start_train_worker.sh
```

Set env vars before running:
```bash
export HF_REPO=YourUser/office-os-loras
export WANDB_PROJECT=office-os
export HF_TOKEN=hf_xxx
export WANDB_API_KEY=xxx
```

---

## Training Details

### GRPO (Group Relative Policy Optimization)

TRL GRPO generates multiple completions per prompt, scores them with a reward function, and optimizes the model to produce higher-reward completions. Key config:

| Parameter | Value | Notes |
|-----------|-------|-------|
| Base model | Qwen/Qwen2.5-3B-Instruct | 4-bit QLoRA via Unsloth |
| LoRA rank | 64 | Applied to q/k/v/o/gate/up/down projections |
| Num generations | 8 | Completions per prompt for reward variance |
| Temperature | 0.9 | High for diverse completions |
| Learning rate | 2e-5 | Default, configurable per request |
| Batch size | 1 | With gradient accumulation of 4 |
| Max steps | min(50, len(data)*3) | Scales with dataset size |
| Precision | bf16 | Half-precision training |
| Optimizer | adamw_8bit | Memory-efficient |

### Reward Function

Each generated completion is scored independently (0.0 to 1.0):

| Component | Score | Criteria |
|-----------|-------|----------|
| Valid JSON | +0.3 | Response parses as JSON |
| Has `action_type` | +0.2 | JSON contains action_type field |
| Valid action for role | +0.3 | action_type is in the role's allowed actions |
| Has `reasoning` | +0.1 | Non-empty reasoning field |
| Has `target` | +0.1 | Non-empty target field |

### Roles Trained

| Role | LoRA Name | Training |
|------|-----------|----------|
| CEO | `office-os-ceo` | Yes |
| Dev | `office-os-dev` | Yes |
| Marketing | `office-os-marketing` | Yes |
| Sales | `office-os-sales` | Yes |
| Content | `office-os-content` | Yes |
| HR | `office-os-hr` | Yes |
| Customer | — | **No** (uses base model) |

### LoRA Hot-Loading

After training, the adapter is hot-loaded into the running vLLM server:

```
POST http://localhost:8080/v1/load_lora_adapter
{
  "lora_name": "office-os-dev",
  "lora_path": "/tmp/office_os_lora/dev/adapter"
}
```

vLLM must be started with `VLLM_ALLOW_RUNTIME_LORA_UPDATING=True` and `--enable-lora` (the entrypoint handles this).

---

## API Reference

### Training Worker (port 8081)

#### `GET /health`

Returns status, step counts, and base model info.

#### `GET /models`

Returns training step counts per role.

#### `POST /train`

Submit trajectories for GRPO training.

```json
{
  "role": "dev",
  "learning_rate": 2e-5,
  "trajectories": [
    {
      "system_prompt": "You are Alex, the Dev Lead...",
      "user_message": "=== Day 3 | Phase: execution | Turn 7 ===\n...",
      "assistant_response": {
        "action_type": "BUILD_FEATURE",
        "target": "SSO Integration",
        "parameters": {},
        "reasoning": "Customer needs SSO for compliance",
        "message": "sales: building SSO, ready in 3 turns"
      },
      "reward": 0.5
    }
  ]
}
```

Response:
```json
{
  "status": "trained",
  "role": "dev",
  "step": 1,
  "role_step": 1,
  "trajectories_used": 5,
  "lora_loaded": true,
  "hf_pushed": true,
  "model_name": "office-os-dev",
  "adapter_path": "/tmp/office_os_lora/dev/adapter"
}
```

#### `POST /hotload`

Manually hot-load a LoRA adapter into vLLM.

```json
{
  "lora_name": "office-os-dev",
  "adapter_path": "/tmp/office_os_lora/dev/adapter"
}
```

---

## Monitoring

### Weights & Biases

Training metrics are logged to W&B under the configured project. Each training run creates a W&B run named `{role}-step{N}` (e.g., `dev-step1`, `sales-step2`).

View at: `https://wandb.ai/your-username/office-os`

Logged metrics include loss, reward mean/std, learning rate, and training steps.

### HuggingFace

LoRA checkpoints are pushed to your HF repo after each training run:

```
HarshalH/office-os-loras/
├── ceo/step-1/
├── dev/step-1/
├── marketing/step-1/
├── sales/step-1/
├── content/step-1/
├── hr/step-1/
├── dev/step-2/     (after retrain)
└── ...
```

### Logs on Northflank

```bash
# Inside the container:
tail -f /tmp/vllm.log      # vLLM output
tail -f /tmp/train.log     # Training worker output
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `No module named 'market'` | Ensure `PYTHONPATH` includes `office_os` dir. The entrypoint does this automatically. |
| vLLM 400 Bad Request | Don't use `tools`/`function_calling` with Qwen on vLLM. Use plain JSON prompting. |
| GRPO loss=0.0 / reward_std=0.0 | Reward function must score EACH completion independently. Not pre-computed rewards. |
| Training not triggering | Check `--train-every` (default 3 days). Each role needs at least 1 trajectory. |
| vLLM OOM | Reduce `--gpu-memory-utilization` (default 0.4) or use smaller model. |
| Container restarts | Use CMD override with `entrypoint.sh` instead of manual terminal sessions. |
| SSH disconnects | CMD override keeps services persistent. SSH is only needed for debugging. |
| `No GPU detected` | Verify Northflank service has H100 GPU assigned in Resources. |
| W&B not logging | Check `WANDB_API_KEY` and `WANDB_PROJECT` env vars are set on Northflank. |
| HF push fails | Check `HF_TOKEN` has write permission and `HF_REPO` exists. |

## Supported Base Models

| Model | Size | H100 Fit | Notes |
|-------|------|----------|-------|
| `Qwen/Qwen2.5-3B-Instruct` | 3B | Yes | Default. Fast training, good for experimentation |
| `Qwen/Qwen2.5-7B-Instruct` | 7B | Yes | Better quality, slower training |
| `meta-llama/Llama-3.2-3B-Instruct` | 3B | Yes | Alternative base model |

## Updating Code on Northflank

The entrypoint runs `git pull` on every container restart. To update code without restarting:

```bash
# SSH into container
cd /home/jovyan/SuperOffice_env && git pull

# Restart only the training worker (vLLM keeps running)
pkill -f train_worker.py
export PYTHONPATH="/home/jovyan/SuperOffice_env/office_os:$PYTHONPATH"
python office_os/training/train_worker.py --port 8081 --host 0.0.0.0 \
    --base-model Qwen/Qwen2.5-3B-Instruct \
    --vllm-url http://localhost:8080 \
    --hf-repo $HF_REPO \
    --wandb-project $WANDB_PROJECT &
```
