#!/bin/bash
# Start TRL GRPO training worker on Northflank H100.
# Run in Terminal 2 (after vLLM is up).
# Usage: bash training/start_train_worker.sh

set -e

BASE_MODEL="${BASE_MODEL:-Qwen/Qwen2.5-3B-Instruct}"
VLLM_PORT="${VLLM_PORT:-8080}"
TRAIN_PORT="${TRAIN_PORT:-8081}"

echo "=== TRL Training Worker ==="
echo "Model: $BASE_MODEL"
echo "Train port: $TRAIN_PORT"
echo "vLLM:  http://localhost:$VLLM_PORT"
echo ""

# ── Install dependencies ──────────────────────────────────────────
echo ">> Installing dependencies..."
pip install --upgrade pip
pip install "trl>=0.12" "datasets>=3.0" "peft>=0.13" "accelerate>=1.0" "bitsandbytes>=0.44"
pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
echo ">> Done."
echo ""

# ── Wait for vLLM to be ready ────────────────────────────────────
echo ">> Waiting for vLLM on port $VLLM_PORT..."
for i in $(seq 1 60); do
    if curl -s "http://localhost:$VLLM_PORT/health" > /dev/null 2>&1; then
        echo ">> vLLM is ready!"
        break
    fi
    if [ "$i" -eq 60 ]; then
        echo "!! vLLM not responding after 5 min. Starting anyway..."
    fi
    sleep 5
done
echo ""

# ── Kill stale training processes ─────────────────────────────────
pkill -9 -f "train_worker.py" 2>/dev/null || true
sleep 1

# ── Start training worker ─────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo ">> Starting training worker on port $TRAIN_PORT..."
exec python "$SCRIPT_DIR/train_worker.py" \
    --port "$TRAIN_PORT" \
    --host 0.0.0.0 \
    --base-model "$BASE_MODEL" \
    --vllm-url "http://localhost:$VLLM_PORT"
