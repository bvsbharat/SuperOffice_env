# Northflank H100 Setup for ART Training

This guide sets up your Northflank H100 GPU to train custom agent models using OpenPipe ART (GRPO reinforcement learning). After training, agents switch from Claude to the fine-tuned model running on the H100.

## Architecture

```
┌─────────────────────────┐     ┌──────────────────────────────────┐
│  Your Machine (Client)  │     │  Northflank H100 GPU (Server)    │
│                         │     │                                  │
│  frontend.py            │────>│  northflank_server.py            │
│  - Runs simulation      │     │  - ART LocalBackend (training)   │
│  - Collects trajectories│     │  - vLLM (inference)              │
│  - Claude for first 3d  │<────│  - LoRA adapters per role        │
│  - ART model after 3d   │     │                                  │
└─────────────────────────┘     └──────────────────────────────────┘
```

## Step 1: Create a Northflank Service

1. Go to your Northflank project dashboard (`Hackathon` project)
2. Click **Create Service** > **Deployment**
3. Choose **Docker image**: `pytorch/pytorch:2.8.0-cuda12.6-cudnn9-runtime`
4. Resources:
   - **GPU**: 1x NVIDIA H100
   - **CPU**: 8+ vCPU recommended
   - **Memory**: 32GB+ recommended
   - **Ephemeral storage**: 20GB (models are large)
5. Under **Advanced** > **CMD override**, set:
   - Entrypoint: `/bin/bash -c`
   - Command: `sleep 3d`

This gives you a running container with GPU access.

## Step 2: SSH into the Container

```bash
# Install Northflank CLI
npm i -g @northflank/cli
northflank login

# Or use the Northflank web terminal (click Terminal button on your service)
```

## Step 3: Install Dependencies

Inside the Northflank container:

```bash
pip install "openpipe-art[backend]" vllm fastapi uvicorn httpx

# Clone your repo (or use Northflank CI/CD with Docker)
git clone https://github.com/YOUR_REPO/openenv-hack-hackathon.git
cd openenv-hack-hackathon/office_os
```

## Step 4: Start the Training Server

```bash
python training/northflank_server.py --port 8080 --base-model Qwen/Qwen2.5-3B-Instruct
```

This starts:
- **ART LocalBackend** — manages training on the H100
- **vLLM** — serves models for inference (auto-started by ART)
- **FastAPI** — accepts training requests from the simulation client

## Step 5: Expose the Port

1. In Northflank dashboard, go to your service > **Ports & DNS**
2. Add port **8080** (HTTP)
3. Enable **Public** access
4. Note the generated URL (e.g., `https://your-service--hackathon--xxxx.code.run`)

## Step 6: Run the Simulation with ART Training

On your local machine:

```bash
# Set your Northflank endpoint
export NORTHFLANK_INFERENCE_ENDPOINT=https://your-service--hackathon--xxxx.code.run

# Run with ART training enabled
python frontend.py --days 30 \
    --art-train \
    --art-backend remote \
    --art-train-every 3 \
    --art-base-model Qwen/Qwen2.5-3B-Instruct \
    --northflank-endpoint $NORTHFLANK_INFERENCE_ENDPOINT
```

### What happens:
1. **Days 1-3**: Agents use Claude (Bedrock) for decisions. Trajectories are collected.
2. **Day 3**: Trajectories are sent to Northflank H100. ART trains LoRA adapters via GRPO.
3. **Days 4+**: Agents switch to the fine-tuned model on the H100 for decisions.
4. **Day 6, 9, 12...**: Retraining with new trajectories. Models improve over time.

## Alternative: Run Everything on Northflank

If you want to run the full simulation on the H100 (no split architecture):

```bash
# On the Northflank H100 container:
cd openenv-hack-hackathon/office_os

# Set API keys
export ANTHROPIC_API_KEY=your-key  # or Bedrock creds
export WANDB_API_KEY=your-key       # optional, for training metrics

# Run simulation with local ART training
python frontend.py --days 30 \
    --art-train \
    --art-backend local \
    --art-train-every 3 \
    --art-base-model Qwen/Qwen2.5-3B-Instruct
```

## Alternative: Docker Deployment

Use the provided Dockerfile for one-click deployment:

```bash
# Build
docker build -t office-os-trainer -f training/Dockerfile.northflank .

# In Northflank: Create service from Docker image
# Push to a registry or use Northflank CI/CD
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check (GPU status, loaded models) |
| `/models` | GET | List all registered models |
| `/train` | POST | Submit trajectories for training |
| `/inference/{role}` | GET | Get inference endpoint for a trained model |

### Train Request Example

```json
POST /train
{
    "role": "dev",
    "base_model": "Qwen/Qwen2.5-3B-Instruct",
    "learning_rate": 1e-5,
    "trajectories": [
        {
            "system_prompt": "You are Alex, the Dev Lead...",
            "user_message": "=== Day 1 | Phase: execution | Turn 3 ===\n...",
            "assistant_response": {
                "action_type": "BUILD_FEATURE",
                "target": "SSO Integration",
                "parameters": {},
                "reasoning": "Customer needs SSO",
                "message": "sales: building SSO, ready in 3 turns"
            },
            "reward": 0.5
        }
    ]
}
```

## Supported Base Models

| Model | Size | H100 Fit | Notes |
|-------|------|----------|-------|
| `Qwen/Qwen2.5-3B-Instruct` | 3B | Yes | Fast training, good for hackathon |
| `Qwen/Qwen2.5-7B-Instruct` | 7B | Yes | Better quality |
| `OpenPipe/Qwen3-14B-Instruct` | 14B | Yes | Best quality, slower |
| `meta-llama/Llama-3.2-3B-Instruct` | 3B | Yes | Alternative |

## Troubleshooting

- **"No GPU detected"**: Check that your Northflank service has a GPU assigned
- **OOM errors**: Reduce batch size or use a smaller base model (3B instead of 14B)
- **vLLM startup slow**: First run downloads the model (~5-10GB). Use persistent storage.
- **Training timeout**: Increase ephemeral storage to 20GB+ in Northflank settings
- **Container restarts**: Containers are ephemeral. Add persistent storage for model checkpoints.

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NORTHFLANK_INFERENCE_ENDPOINT` | Northflank vLLM URL | `https://your-service.code.run` |
| `NORTHFLANK_API_KEY` | API key for auth | `nf_xxxx` |
| `WANDB_API_KEY` | W&B key for metrics logging | `xxx` |
| `HF_TOKEN` | HuggingFace token (for gated models) | `hf_xxx` |
