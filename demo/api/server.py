"""
SuperOffice GTM Demo -- FastAPI server with real office_os RL environment.

Usage:
    # Ollama (Mac / local — no API key needed):
    ollama pull qwen3.5:0.8b
    python server.py --provider ollama --days 10

    # Ollama with custom model:
    python server.py --provider ollama --ollama-model qwen3.5:0.8b --days 10

    # Bedrock:
    python server.py --provider bedrock --model global.anthropic.claude-haiku-4-5-20251001-v1:0 --days 10

    # ART/Northflank vLLM:
    python server.py --provider art --art-endpoint https://your-endpoint.com --days 10

    # Or via uvicorn (uses env vars for config):
    uvicorn server:app --reload --port 8000
"""

import argparse
import os
import sys

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Store config in module-level dict so routes.py can access it
bridge_config: dict = {
    "provider": os.environ.get("PROVIDER", "bedrock"),
    "model": os.environ.get("MODEL", "global.anthropic.claude-haiku-4-5-20251001-v1:0"),
    "days": int(os.environ.get("DAYS", "10")),
    "art_endpoint": os.environ.get("ART_ENDPOINT", ""),
    "art_model": os.environ.get("ART_MODEL", "Qwen/Qwen2.5-3B-Instruct"),
    "art_api_key": os.environ.get("ART_API_KEY", ""),
    "aws_region": os.environ.get("AWS_REGION", "us-east-1"),
    "mode": os.environ.get("SIM_MODE", "llm"),
    "northflank_endpoint": os.environ.get("NORTHFLANK_ENDPOINT", ""),
    "train_every": int(os.environ.get("TRAIN_EVERY", "999")),
}

from routes import router

app = FastAPI(
    title="SuperOffice GTM RL Demo",
    description="7-agent Go-To-Market RL simulation with real office_os environment",
    version="0.2.0",
)

# CORS -- allow Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

# Serve built frontend if it exists
dist_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(dist_path):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="static")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "superoffice-gtm-demo",
        "provider": bridge_config["provider"],
        "days": bridge_config["days"],
    }


def main():
    parser = argparse.ArgumentParser(description="SuperOffice GTM Demo Server")
    parser.add_argument("--provider", choices=["bedrock", "art", "ollama", "anthropic"], default="bedrock",
                        help="LLM provider: bedrock (default), ollama (local Mac), art (vLLM), anthropic (direct)")
    parser.add_argument("--model", type=str, default="global.anthropic.claude-haiku-4-5-20251001-v1:0",
                        help="Model name (default: global.anthropic.claude-haiku-4-5-20251001-v1:0)")
    parser.add_argument("--days", type=int, default=10,
                        help="Days to simulate per episode (default: 10)")
    parser.add_argument("--art-endpoint", type=str, default="",
                        help="ART/vLLM endpoint URL")
    parser.add_argument("--art-model", type=str, default="Qwen/Qwen2.5-3B-Instruct",
                        help="Model name on the vLLM endpoint")
    parser.add_argument("--art-api-key", type=str, default="",
                        help="API key for ART endpoint")
    parser.add_argument("--aws-region", type=str, default="us-east-1",
                        help="AWS region for Bedrock")
    parser.add_argument("--mode", choices=["llm", "training", "inference"], default="llm",
                        help="Simulation mode: llm (default), training (collect trajectories), inference (use trained LoRA)")
    parser.add_argument("--northflank-endpoint", type=str, default="",
                        help="Northflank vLLM endpoint for training/inference")
    parser.add_argument("--train-every", type=int, default=999,
                        help="Train every N simulation days (default: 999 = end of episode only)")
    # Ollama options
    parser.add_argument("--ollama-model", type=str, default="qwen3.5:0.8b",
                        help="Ollama model name (default: qwen3.5:0.8b)")
    parser.add_argument("--ollama-host", type=str, default="http://localhost:11434",
                        help="Ollama server URL (default: http://localhost:11434)")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--host", type=str, default="0.0.0.0")
    args = parser.parse_args()

    # Update config
    bridge_config.update({
        "provider": args.provider,
        "model": args.model,
        "days": args.days,
        "art_endpoint": args.art_endpoint or os.environ.get("ART_ENDPOINT", ""),
        "art_model": args.art_model,
        "art_api_key": args.art_api_key or os.environ.get("ART_API_KEY", ""),
        "aws_region": args.aws_region,
        "mode": args.mode,
        "northflank_endpoint": args.northflank_endpoint or os.environ.get("NORTHFLANK_ENDPOINT", ""),
        "train_every": args.train_every,
        "ollama_model": args.ollama_model,
        "ollama_host": args.ollama_host,
    })

    import uvicorn
    print(f"Starting server: provider={args.provider}, model={args.model}, days={args.days}, mode={args.mode}")
    if args.provider == "ollama":
        print(f"  Ollama model: {args.ollama_model}")
        print(f"  Ollama host: {args.ollama_host}")
    elif args.provider == "art":
        print(f"  ART endpoint: {bridge_config['art_endpoint']}")
        print(f"  ART model: {bridge_config['art_model']}")
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
