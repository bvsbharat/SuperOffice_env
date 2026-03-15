"""Lightweight server-side analytics for HF Space.

Tracks page views, unique visitors (hashed IPs), simulation steps,
and popular endpoints. Persists to a JSON file so data survives restarts.

No external dependencies. Privacy-friendly: only stores hashed IPs.
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone


_DATA_DIR = os.environ.get("ANALYTICS_DIR", "/tmp/analytics")
_DATA_FILE = os.path.join(_DATA_DIR, "analytics.json")
_LOCK = threading.RLock()

# In-memory state (loaded from disk on startup)
_stats: dict = {}


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _hash_ip(ip: str) -> str:
    """One-way hash of IP for privacy. Same IP = same hash within a day."""
    salt = _today()
    return hashlib.sha256(f"{salt}:{ip}".encode()).hexdigest()[:12]


def _ensure_loaded():
    """Load stats from disk if not already loaded."""
    global _stats
    if _stats:
        return
    os.makedirs(_DATA_DIR, exist_ok=True)
    if os.path.exists(_DATA_FILE):
        try:
            with open(_DATA_FILE) as f:
                _stats = json.load(f)
        except (json.JSONDecodeError, OSError):
            _stats = {}
    if not _stats:
        _stats = {
            "total_views": 0,
            "total_steps": 0,
            "total_resets": 0,
            "unique_visitors": set(),
            "daily": {},
            "first_seen": _today(),
        }
    # Convert unique_visitors list back to set
    if isinstance(_stats.get("unique_visitors"), list):
        _stats["unique_visitors"] = set(_stats["unique_visitors"])


def _save():
    """Persist stats to disk (called periodically, not on every event)."""
    try:
        os.makedirs(_DATA_DIR, exist_ok=True)
        data = {**_stats}
        data["unique_visitors"] = list(_stats.get("unique_visitors", set()))
        with open(_DATA_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except OSError:
        pass


def _get_daily() -> dict:
    """Get or create today's daily bucket."""
    today = _today()
    if today not in _stats.setdefault("daily", {}):
        _stats["daily"][today] = {
            "views": 0,
            "steps": 0,
            "resets": 0,
            "visitors": [],
            "endpoints": {},
        }
    return _stats["daily"][today]


def track_view(ip: str):
    """Track a page view / any request."""
    with _LOCK:
        _ensure_loaded()
        hashed = _hash_ip(ip)
        _stats["total_views"] = _stats.get("total_views", 0) + 1
        _stats.setdefault("unique_visitors", set()).add(hashed)

        daily = _get_daily()
        daily["views"] += 1
        if hashed not in daily["visitors"]:
            daily["visitors"].append(hashed)


def track_endpoint(ip: str, endpoint: str):
    """Track a specific endpoint hit."""
    with _LOCK:
        _ensure_loaded()
        daily = _get_daily()
        daily["endpoints"][endpoint] = daily["endpoints"].get(endpoint, 0) + 1


def track_step(ip: str):
    """Track a simulation step."""
    with _LOCK:
        _ensure_loaded()
        _stats["total_steps"] = _stats.get("total_steps", 0) + 1
        _get_daily()["steps"] += 1
        track_endpoint(ip, "/api/step")


def track_reset(ip: str):
    """Track a simulation reset."""
    with _LOCK:
        _ensure_loaded()
        _stats["total_resets"] = _stats.get("total_resets", 0) + 1
        _get_daily()["resets"] += 1
        track_endpoint(ip, "/api/reset")


def get_summary() -> dict:
    """Get analytics summary for the dashboard."""
    with _LOCK:
        _ensure_loaded()
        _save()  # Persist on read

        daily = _stats.get("daily", {})
        today = _today()
        today_data = daily.get(today, {})

        # Last 7 days trend
        recent_days = sorted(daily.keys())[-7:]
        trend = []
        for day in recent_days:
            d = daily[day]
            trend.append({
                "date": day,
                "views": d.get("views", 0),
                "visitors": len(d.get("visitors", [])),
                "steps": d.get("steps", 0),
                "resets": d.get("resets", 0),
            })

        return {
            "total_views": _stats.get("total_views", 0),
            "total_unique_visitors": len(_stats.get("unique_visitors", set())),
            "total_steps": _stats.get("total_steps", 0),
            "total_resets": _stats.get("total_resets", 0),
            "first_seen": _stats.get("first_seen", today),
            "today": {
                "views": today_data.get("views", 0),
                "visitors": len(today_data.get("visitors", [])),
                "steps": today_data.get("steps", 0),
                "resets": today_data.get("resets", 0),
            },
            "trend": trend,
        }
