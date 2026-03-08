"""
SuperOffice GTM Demo — FastAPI server

Usage:
    uvicorn server:app --reload --port 8000
"""

from dotenv import load_dotenv
load_dotenv()  # Load .env before anything else reads env vars

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from routes import router

app = FastAPI(
    title="SuperOffice GTM RL Demo",
    description="8-agent Go-To-Market RL simulation API",
    version="0.1.0",
)

# CORS — allow Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
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
    return {"status": "ok", "service": "superoffice-gtm-demo"}
