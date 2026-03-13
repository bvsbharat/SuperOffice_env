#!/bin/bash
# ============================================================
# Office OS — Mac Setup Script (Apple Silicon)
# ============================================================
# Sets up everything needed to run the Office OS simulation
# locally on a MacBook Pro with Apple Silicon (M1/M2/M3/M4).
#
# What this script does:
#   1. Checks prerequisites (Python 3.10+, Homebrew)
#   2. Installs Ollama (local LLM inference)
#   3. Pulls the Qwen 3.5 0.8B model (~1GB)
#   4. Creates a Python virtual environment
#   5. Installs Python dependencies
#   6. Optionally installs MLX for local LoRA training
#   7. Optionally sets up the React frontend
#
# Usage:
#   chmod +x setup_mac.sh
#   ./setup_mac.sh
#
# After setup, run:
#   # Terminal simulation (no frontend):
#   cd office_os && python run_agents.py --local --ollama
#
#   # With frontend:
#   cd demo/api && python server.py --provider ollama --days 10
#   # (In another terminal)
#   cd demo/frontend && npm run dev
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "============================================================"
echo "  Office OS — Mac Setup (Apple Silicon)"
echo "============================================================"
echo ""

# ── 1. Check prerequisites ────────────────────────────────────

# Check macOS
if [[ "$(uname)" != "Darwin" ]]; then
    echo -e "${RED}Error: This script is for macOS only.${NC}"
    exit 1
fi

# Check Apple Silicon
ARCH=$(uname -m)
if [[ "$ARCH" != "arm64" ]]; then
    echo -e "${YELLOW}Warning: Not running on Apple Silicon ($ARCH).${NC}"
    echo "MLX training will not be available. Inference via Ollama will still work."
fi

# Check Python
PYTHON=""
for cmd in python3.12 python3.11 python3.10 python3; do
    if command -v "$cmd" &>/dev/null; then
        PY_VERSION=$("$cmd" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+')
        PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
        PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
        if [[ "$PY_MAJOR" -ge 3 && "$PY_MINOR" -ge 10 ]]; then
            PYTHON="$cmd"
            break
        fi
    fi
done

if [[ -z "$PYTHON" ]]; then
    echo -e "${RED}Error: Python 3.10+ is required.${NC}"
    echo "Install with: brew install python@3.12"
    exit 1
fi
echo -e "${GREEN}✓ Python: $($PYTHON --version)${NC}"

# Check Homebrew
if ! command -v brew &>/dev/null; then
    echo -e "${YELLOW}Homebrew not found. Installing...${NC}"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
echo -e "${GREEN}✓ Homebrew: $(brew --version | head -1)${NC}"

# ── 2. Install Ollama ─────────────────────────────────────────

if command -v ollama &>/dev/null; then
    echo -e "${GREEN}✓ Ollama already installed: $(ollama --version 2>&1 | head -1)${NC}"
else
    echo -e "${YELLOW}Installing Ollama...${NC}"
    brew install ollama
    echo -e "${GREEN}✓ Ollama installed${NC}"
fi

# Start Ollama if not running
if ! curl -s http://localhost:11434/api/tags &>/dev/null; then
    echo "Starting Ollama service..."
    ollama serve &>/dev/null &
    sleep 3
    if curl -s http://localhost:11434/api/tags &>/dev/null; then
        echo -e "${GREEN}✓ Ollama service started${NC}"
    else
        echo -e "${YELLOW}Note: Ollama may need to be started manually.${NC}"
        echo "  Open Ollama.app or run: ollama serve"
    fi
else
    echo -e "${GREEN}✓ Ollama service running${NC}"
fi

# ── 3. Pull Qwen 3.5 0.8B ────────────────────────────────────

echo ""
echo "Pulling Qwen 3.5 0.8B model (~1GB download)..."
if ollama list 2>/dev/null | grep -q "qwen3.5:0.8b"; then
    echo -e "${GREEN}✓ qwen3.5:0.8b already downloaded${NC}"
else
    ollama pull qwen3.5:0.8b
    echo -e "${GREEN}✓ qwen3.5:0.8b downloaded${NC}"
fi

# Quick test
echo "Testing Ollama inference..."
RESPONSE=$(curl -s http://localhost:11434/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{"model": "qwen3.5:0.8b", "messages": [{"role": "user", "content": "Say OK"}], "max_tokens": 5}' 2>/dev/null)
if echo "$RESPONSE" | grep -q "choices"; then
    echo -e "${GREEN}✓ Ollama inference working${NC}"
else
    echo -e "${YELLOW}Warning: Ollama test failed. Make sure ollama serve is running.${NC}"
fi

# ── 4. Python virtual environment ─────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"

echo ""
if [[ -d "$VENV_DIR" ]]; then
    echo -e "${GREEN}✓ Virtual environment exists at $VENV_DIR${NC}"
else
    echo "Creating virtual environment..."
    $PYTHON -m venv "$VENV_DIR"
    echo -e "${GREEN}✓ Virtual environment created${NC}"
fi

# Activate
source "$VENV_DIR/bin/activate"
echo -e "${GREEN}✓ Virtual environment activated${NC}"

# ── 5. Install Python dependencies ───────────────────────────

echo ""
echo "Installing Python dependencies..."
pip install --upgrade pip -q
pip install -r "$SCRIPT_DIR/requirements-mac.txt" -q
echo -e "${GREEN}✓ Python dependencies installed${NC}"

# ── 6. Optional: MLX for local training ───────────────────────

echo ""
read -p "Install MLX for local LoRA training? (requires Apple Silicon) [y/N]: " INSTALL_MLX
if [[ "$INSTALL_MLX" =~ ^[Yy]$ ]]; then
    if [[ "$ARCH" == "arm64" ]]; then
        pip install mlx mlx-lm -q
        echo -e "${GREEN}✓ MLX installed for local training${NC}"
    else
        echo -e "${RED}MLX requires Apple Silicon. Skipping.${NC}"
    fi
else
    echo "Skipping MLX installation."
fi

# ── 7. Optional: Frontend setup ──────────────────────────────

echo ""
read -p "Set up React frontend? (requires Node.js) [y/N]: " SETUP_FRONTEND
if [[ "$SETUP_FRONTEND" =~ ^[Yy]$ ]]; then
    if command -v node &>/dev/null; then
        echo -e "${GREEN}✓ Node.js: $(node --version)${NC}"
    else
        echo "Installing Node.js..."
        brew install node
    fi

    FRONTEND_DIR="$SCRIPT_DIR/demo/frontend"
    if [[ -d "$FRONTEND_DIR" ]]; then
        echo "Installing frontend dependencies..."
        cd "$FRONTEND_DIR"
        npm install -q
        echo -e "${GREEN}✓ Frontend dependencies installed${NC}"
        cd "$SCRIPT_DIR"
    else
        echo -e "${YELLOW}Warning: Frontend directory not found at $FRONTEND_DIR${NC}"
    fi
else
    echo "Skipping frontend setup."
fi

# ── Done ──────────────────────────────────────────────────────

echo ""
echo "============================================================"
echo -e "${GREEN}  Setup complete!${NC}"
echo "============================================================"
echo ""
echo "Quick start:"
echo ""
echo "  # Activate the virtual environment:"
echo "  source .venv/bin/activate"
echo ""
echo "  # Run simulation in terminal (no frontend):"
echo "  cd office_os"
echo "  python run_agents.py --local --ollama --days 5"
echo ""
echo "  # Run with the frontend:"
echo "  cd demo/api && python server.py --provider ollama --days 10"
echo "  # In another terminal:"
echo "  cd demo/frontend && npm run dev"
echo ""
echo "  # Run with local LoRA training (if MLX installed):"
echo "  cd office_os"
echo "  python run_agents.py --local --ollama --mine-scenarios --days 10"
echo ""
echo "  # Benchmark old vs new prompts:"
echo "  cd office_os"
echo "  python benchmark_prompts.py --days 5 --episodes 3"
echo ""
echo "Memory usage estimate:"
echo "  Ollama + qwen3.5:0.8b: ~1.5GB RAM"
echo "  Python simulation:     ~500MB RAM"
echo "  MLX training (if used): ~2-4GB RAM"
echo "  Total: ~2-6GB of your 24GB"
echo ""
