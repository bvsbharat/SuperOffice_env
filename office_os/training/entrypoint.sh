#!/bin/bash
# Northflank container entrypoint — starts vLLM + training worker + Jupyter.
# Set as CMD override on Northflank to make all services persistent.

BASE_MODEL="${BASE_MODEL:-Qwen/Qwen2.5-14B-Instruct}"
REPO_DIR="/home/jovyan/SuperOffice_env"

echo "=== Office OS Northflank Entrypoint ==="
echo "Model: $BASE_MODEL"
echo "HF_REPO: ${HF_REPO:-not set}"
echo "WANDB_PROJECT: ${WANDB_PROJECT:-not set}"

# ── Update repo ───────────────────────────────────────────────────
cd "$REPO_DIR" && git pull || true
cd "$REPO_DIR/office_os"

# ── Install deps (cached after first run if volume mounted) ───────
pip install -q "trl>=0.12" "datasets>=3.0" "peft>=0.13" "accelerate>=1.0" "bitsandbytes>=0.44"
pip install -q "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
pip install -q wandb huggingface_hub httpx
pip install -q "vllm>=0.6"

# ── Auth (if tokens set in Northflank Environment) ────────────────
if [ -n "$HF_TOKEN" ]; then
    huggingface-cli login --token "$HF_TOKEN" --add-to-git-credential 2>/dev/null || true
    echo ">> HuggingFace authenticated"
fi
if [ -n "$WANDB_API_KEY" ]; then
    echo ">> W&B authenticated via WANDB_API_KEY"
fi

# ── Kill stale processes ──────────────────────────────────────────
pkill -9 -f "vllm.entrypoints" 2>/dev/null || true
pkill -9 -f "train_worker.py" 2>/dev/null || true
sleep 2

# ── Set Python path so training worker can import market.config ────
export PYTHONPATH="$REPO_DIR/office_os:$PYTHONPATH"

# ── Start vLLM inference (background) ─────────────────────────────
echo ">> Starting vLLM on port 8080..."
VLLM_ALLOW_RUNTIME_LORA_UPDATING=True python -m vllm.entrypoints.openai.api_server \
    --model "$BASE_MODEL" \
    --port 8080 \
    --host 0.0.0.0 \
    --enable-lora \
    --max-loras 8 \
    --max-lora-rank 32 \
    --gpu-memory-utilization 0.4 \
    --max-model-len 4096 \
    --enforce-eager \
    > /tmp/vllm.log 2>&1 &

VLLM_PID=$!
echo ">> vLLM PID: $VLLM_PID"

# Wait for vLLM health
echo ">> Waiting for vLLM..."
for i in $(seq 1 120); do
    if curl -s http://localhost:8080/health > /dev/null 2>&1; then
        echo ">> vLLM ready!"
        break
    fi
    if ! kill -0 $VLLM_PID 2>/dev/null; then
        echo "!! vLLM crashed. Check /tmp/vllm.log"
        cat /tmp/vllm.log | tail -30
        break
    fi
    sleep 5
done

# ── Start training worker (background) ────────────────────────────
TRAIN_SCRIPT="$REPO_DIR/office_os/training/train_worker.py"
echo ">> Starting training worker on port 8081..."

TRAIN_CMD="python $TRAIN_SCRIPT --port 8081 --host 0.0.0.0 --base-model $BASE_MODEL --vllm-url http://localhost:8080"
[ -n "$HF_REPO" ] && TRAIN_CMD="$TRAIN_CMD --hf-repo $HF_REPO"
[ -n "$WANDB_PROJECT" ] && TRAIN_CMD="$TRAIN_CMD --wandb-project $WANDB_PROJECT"

$TRAIN_CMD > /tmp/train.log 2>&1 &
TRAIN_PID=$!
echo ">> Training worker PID: $TRAIN_PID"

echo ""
echo "============================================"
echo " vLLM:     port 8080 (PID $VLLM_PID)"
echo " Training: port 8081 (PID $TRAIN_PID)"
echo " Logs:     /tmp/vllm.log, /tmp/train.log"
echo "============================================"
echo ""

# ── Start Jupyter (foreground — keeps container alive) ────────────
echo ">> Starting Jupyter notebook server..."
exec jupyter notebook --ip=0.0.0.0 --port=8888 --no-browser --allow-root \
    --NotebookApp.token='' --NotebookApp.password=''
