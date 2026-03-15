#!/bin/bash
# Docker entrypoint for Office OS training server.
# Starts vLLM (port 8000) + GRPO training worker (port 8001).

set -euo pipefail

BASE_MODEL="${BASE_MODEL:-Qwen/Qwen3.5-0.8B}"
VLLM_PORT="${VLLM_PORT:-8000}"
TRAIN_PORT="${TRAIN_PORT:-8001}"
GPU_MEM_UTIL="${GPU_MEM_UTIL:-0.5}"
MAX_MODEL_LEN="${MAX_MODEL_LEN:-32768}"

echo "=== Office OS Training Server ==="
echo "Model:     $BASE_MODEL"
echo "vLLM:      port $VLLM_PORT"
echo "Training:  port $TRAIN_PORT"
echo "HF_REPO:   ${HF_REPO:-not set}"
echo "W&B:       ${WANDB_PROJECT:-not set}"
echo ""

# ── Auth ────────────────────────────────────────────────────────────
if [ -n "${HF_TOKEN:-}" ]; then
    huggingface-cli login --token "$HF_TOKEN" --add-to-git-credential 2>/dev/null || true
    echo ">> HuggingFace authenticated"
fi

# ── Start vLLM inference (background) ──────────────────────────────
echo ">> Starting vLLM on port $VLLM_PORT..."
VLLM_ALLOW_RUNTIME_LORA_UPDATING=True python -m vllm.entrypoints.openai.api_server \
    --model "$BASE_MODEL" \
    --port "$VLLM_PORT" \
    --host 0.0.0.0 \
    --enable-lora \
    --max-loras 8 \
    --max-lora-rank 16 \
    --gpu-memory-utilization "$GPU_MEM_UTIL" \
    --max-model-len "$MAX_MODEL_LEN" \
    --enforce-eager \
    > /tmp/vllm.log 2>&1 &

VLLM_PID=$!
echo ">> vLLM PID: $VLLM_PID"

# Wait for vLLM health
echo ">> Waiting for vLLM to be ready..."
for i in $(seq 1 180); do
    if curl -s "http://localhost:$VLLM_PORT/health" > /dev/null 2>&1; then
        echo ">> vLLM ready!"
        break
    fi
    if ! kill -0 $VLLM_PID 2>/dev/null; then
        echo "!! vLLM crashed. Last 30 lines:"
        tail -30 /tmp/vllm.log
        exit 1
    fi
    sleep 5
done

# ── Start training worker (foreground — keeps container alive) ─────
TRAIN_SCRIPT="/app/office_os/training/train_worker.py"
echo ">> Starting training worker on port $TRAIN_PORT..."

TRAIN_CMD="python $TRAIN_SCRIPT --port $TRAIN_PORT --host 0.0.0.0 --base-model $BASE_MODEL --vllm-url http://localhost:$VLLM_PORT"
[ -n "${HF_REPO:-}" ] && TRAIN_CMD="$TRAIN_CMD --hf-repo $HF_REPO"
[ -n "${WANDB_PROJECT:-}" ] && TRAIN_CMD="$TRAIN_CMD --wandb-project $WANDB_PROJECT"

echo ""
echo "============================================"
echo " vLLM:     port $VLLM_PORT (PID $VLLM_PID)"
echo " Training: port $TRAIN_PORT (foreground)"
echo " Logs:     /tmp/vllm.log"
echo "============================================"
echo ""

exec $TRAIN_CMD
