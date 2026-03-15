# Multi-stage Dockerfile for HF Space deployment
# Bundles React frontend + FastAPI backend into a single container on port 7860

# ── Stage 1: Build React frontend ──────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend
COPY demo/frontend/package.json demo/frontend/package-lock.json* ./
RUN npm ci --ignore-scripts 2>/dev/null || npm install
COPY demo/frontend/ ./
RUN npm run build

# ── Stage 2: Python runtime ────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# System dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY demo/api/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt && rm /tmp/requirements.txt

# Copy office_os environment (needed by rl_bridge via relative path ../../office_os)
COPY office_os/ /app/office_os/

# Copy demo API server
COPY demo/api/ /app/demo/api/

# Copy built React frontend into the path server.py expects
# server.py: os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
COPY --from=frontend-builder /app/frontend/dist /app/demo/frontend/dist

# Set working directory to demo/api so bare imports (routes, rl_bridge) resolve
WORKDIR /app/demo/api

# rl_bridge.py adds ../../office_os to sys.path automatically, so no PYTHONPATH needed

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:7860/health || exit 1

# Run the demo server on HF Spaces default port
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "7860"]
