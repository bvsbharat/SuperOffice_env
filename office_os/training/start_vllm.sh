#!/bin/bash
# Start vLLM inference server on Northflank H100.
# Run in Terminal 1.
# Usage: bash training/start_vllm.sh

set -e

BASE_MODEL="${BASE_MODEL:-Qwen/Qwen2.5-3B-Instruct}"
VLLM_PORT="${VLLM_PORT:-8080}"

echo "=== vLLM Inference Server ==="
echo "Model: $BASE_MODEL"
echo "Port:  $VLLM_PORT"
echo ""

# ── Install dependencies ──────────────────────────────────────────
echo ">> Installing dependencies..."
pip install --upgrade pip
pip install "vllm>=0.6"
echo ">> Done."
echo ""

# ── Kill stale vLLM processes ─────────────────────────────────────
echo ">> Cleaning up stale vLLM processes..."
pkill -9 -f "vllm.entrypoints" 2>/dev/null || true
sleep 2

# ── Start vLLM ────────────────────────────────────────────────────
echo ">> Starting vLLM on port $VLLM_PORT..."
VLLM_ALLOW_RUNTIME_LORA_UPDATING=True exec python -m vllm.entrypoints.openai.api_server \
    --model "$BASE_MODEL" \
    --port "$VLLM_PORT" \
    --host 0.0.0.0 \
    --enable-lora \
    --max-loras 2 \
    --max-lora-rank 64 \
    --gpu-memory-utilization 0.4 \
    --max-model-len 4096 \
    --enforce-eager
