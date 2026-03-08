#!/bin/bash
# Run full training pipeline on Northflank server.
# Paste into Jupyter terminal, then close your laptop.
#
# Usage:
#   bash training/run_training.sh
#   bash training/run_training.sh 100    # custom episode count

set -e

EPISODES="${1:-50}"
REPO_DIR="/home/jovyan/SuperOffice_env"
LOG="/tmp/training_run.log"

echo "=== Office OS Training Pipeline ==="
echo "Episodes: $EPISODES"
echo "Log:      $LOG"
echo ""

# 1. Pull latest code
cd "$REPO_DIR" && git pull
cd "$REPO_DIR/office_os"
export PYTHONPATH="$REPO_DIR/office_os:$PYTHONPATH"

# 2. Install deps (openenv-core is needed for environment)
pip install -q "openenv-core[core]>=0.2.0" python-dotenv anthropic boto3 httpx 2>/dev/null

# 2. Generate training data (CPU only, ~60s)
echo ">> Generating training data..."
python generate_training_data.py --episodes "$EPISODES" --include-negative --neg-ratio 0.15

# 3. Send to training worker in background
echo ">> Starting training (background)..."
nohup python send_training.py > "$LOG" 2>&1 &
TRAIN_PID=$!

echo ""
echo "============================================"
echo "  Training started! PID: $TRAIN_PID"
echo "  Safe to close your laptop."
echo ""
echo "  Monitor:"
echo "    tail -f $LOG"
echo "    curl -s localhost:8081/health | python3 -m json.tool"
echo "============================================"
