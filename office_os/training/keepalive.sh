#!/bin/bash
# Ping both Northflank servers every 10 seconds to keep them active.
# Usage: bash training/keepalive.sh

VLLM_URL="${NORTHFLANK_INFERENCE_ENDPOINT:-https://vllm--jupyter-pytorch--ddk86ftkfknr.code.run}"
TRAIN_URL="${NORTHFLANK_TRAIN_ENDPOINT:-https://training--jupyter-pytorch--ddk86ftkfknr.code.run}"

echo "Keepalive pinging every 10s:"
echo "  vLLM:     $VLLM_URL/health"
echo "  Training: $TRAIN_URL/health"
echo ""

while true; do
    TS=$(date +%H:%M:%S)
    VLLM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$VLLM_URL/health" --max-time 5 2>/dev/null || echo "ERR")
    TRAIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$TRAIN_URL/health" --max-time 5 2>/dev/null || echo "ERR")
    echo "[$TS] vLLM: $VLLM_STATUS | Train: $TRAIN_STATUS"
    sleep 10
done
