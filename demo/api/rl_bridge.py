"""
Bridge between the real office_os RL environment and the demo frontend.

Wraps OfficeOsEnvironment + 7 LLMAgent instances, converting their outputs
into the JSON shape the React frontend expects via WebSocket.
"""

from __future__ import annotations

import logging
import os
import sys
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Add office_os to sys.path so we can import its modules
_office_os_dir = os.path.join(os.path.dirname(__file__), "..", "..", "office_os")
if _office_os_dir not in sys.path:
    sys.path.insert(0, os.path.abspath(_office_os_dir))

# Shim openenv.core if not installed — the office_os modules import from it
# but we only need the base classes as no-op parents
try:
    import openenv.core.env_server.interfaces  # noqa: F401
except (ImportError, ModuleNotFoundError):
    import types as _t

    class _Environment:
        """Stub base class replacing openenv Environment."""
        SUPPORTS_CONCURRENT_SESSIONS = True

    from pydantic import BaseModel as _BM

    class _Action(_BM):
        """Stub Pydantic base for openenv Action."""
        class Config:
            extra = "allow"

    class _Observation(_BM):
        """Stub Pydantic base for openenv Observation."""
        done: bool = False
        reward: float = 0.0
        metadata: dict = {}
        class Config:
            extra = "allow"

    class _State:
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)

    # Build the fake module hierarchy: openenv.core.env_server.{interfaces,types}
    _openenv = _t.ModuleType("openenv")
    _core = _t.ModuleType("openenv.core")
    _env_server = _t.ModuleType("openenv.core.env_server")
    _interfaces = _t.ModuleType("openenv.core.env_server.interfaces")
    _types_mod = _t.ModuleType("openenv.core.env_server.types")

    _interfaces.Environment = _Environment  # type: ignore[attr-defined]
    _types_mod.State = _State  # type: ignore[attr-defined]
    _types_mod.Action = _Action  # type: ignore[attr-defined]
    _types_mod.Observation = _Observation  # type: ignore[attr-defined]

    _env_server.interfaces = _interfaces  # type: ignore[attr-defined]
    _env_server.types = _types_mod  # type: ignore[attr-defined]
    _core.env_server = _env_server  # type: ignore[attr-defined]
    _openenv.core = _core  # type: ignore[attr-defined]

    sys.modules.setdefault("openenv", _openenv)
    sys.modules["openenv.core"] = _core
    sys.modules["openenv.core.env_server"] = _env_server
    sys.modules["openenv.core.env_server.interfaces"] = _interfaces
    sys.modules["openenv.core.env_server.types"] = _types_mod

    logger.info("openenv.core shimmed — using stub base classes")

# Import office_os modules — use importlib.util to avoid name collision
# with demo/api/server.py (Python sees it as the 'server' module, shadowing
# the office_os/server/ package).
import importlib.util as _ilu

def _import_from_path(module_name: str, file_path: str):
    """Import a module from an absolute file path."""
    spec = _ilu.spec_from_file_location(module_name, file_path)
    mod = _ilu.module_from_spec(spec)
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)
    return mod

_oos_dir = os.path.abspath(_office_os_dir)

# Save whatever 'server' module exists (may be the demo's server.py being loaded)
_saved_server_mod = sys.modules.pop("server", None)

# Register office_os/server as a package under 'server' so its sub-imports work
_server_pkg_init = os.path.join(_oos_dir, "server", "__init__.py")
if os.path.exists(_server_pkg_init):
    _import_from_path("server", _server_pkg_init)

_oos_env_file = os.path.join(_oos_dir, "server", "office_os_environment.py")
_oos_env_mod = _import_from_path("server.office_os_environment", _oos_env_file)
OfficeOsEnvironment = _oos_env_mod.OfficeOsEnvironment

# Remove the office_os 'server' package from sys.modules so demo's server.py
# can register itself later (or restore if it was already there)
sys.modules.pop("server", None)
sys.modules.pop("server.office_os_environment", None)
if _saved_server_mod is not None:
    sys.modules["server"] = _saved_server_mod

from agents.llm_agent import LLMAgent
from market.config import AGENT_ROLES, TURNS_PER_DAY
from models import OfficeOsAction

# Agent display info
AGENT_INFO = {
    "ceo":       {"name": "Jeeya (CEO)",      "room": "Exec Suite",   "emoji": "\U0001F451", "color": "#ffd700", "role": "Strategist"},
    "dev":       {"name": "Alex (Dev)",        "room": "Dev Room",     "emoji": "\u2699\ufe0f", "color": "#00f5d4", "role": "Engineering"},
    "marketing": {"name": "Jordan (Mktg)",     "room": "Campaign Hub", "emoji": "\U0001F4E3", "color": "#ff6b9d", "role": "Demand Gen"},
    "sales":     {"name": "Sam (Sales)",       "room": "Sales Floor",  "emoji": "\U0001F91D", "color": "#f77f00", "role": "Revenue"},
    "content":   {"name": "Casey (Content)",   "room": "Content Lab",  "emoji": "\u270d\ufe0f", "color": "#9b5de5", "role": "Content"},
    "hr":        {"name": "Pat (HR)",          "room": "Ops Room",     "emoji": "\U0001F4CB", "color": "#00b4d8", "role": "Ops"},
    "customer":  {"name": "Customer",          "room": "Lobby",        "emoji": "\U0001F9D1\u200d\U0001F4BC", "color": "#fee440", "role": "Reward Oracle"},
}


class OfficeOsBridge:
    """
    Adapter wrapping the real OfficeOsEnvironment + LLMAgent instances.

    Provides reset(), step(), get_state(), get_kpi_history(), get_conversations()
    returning dicts in the shape the frontend expects.
    """

    def __init__(
        self,
        provider: str = "bedrock",
        model: str = "claude-haiku-4-5-20251001",
        days: int = 10,
        art_endpoint: str = "",
        art_model: str = "Qwen/Qwen2.5-3B-Instruct",
        art_api_key: str = "",
        aws_region: str = "us-east-1",
        mode: str = "llm",
        northflank_endpoint: str = "",
        train_every: int = 999,
        ollama_model: str = "qwen3.5:0.8b",
        ollama_host: str = "http://localhost:11434",
    ):
        self.provider = provider
        self.model = model
        self.max_days = days
        self.art_endpoint = art_endpoint
        self.art_model = art_model
        self.art_api_key = art_api_key
        self.aws_region = aws_region
        self._mode = mode
        self._northflank_endpoint = northflank_endpoint
        self._train_every = train_every
        self.ollama_model = ollama_model
        self.ollama_host = ollama_host
        self._collector = None   # Optional TrajectoryCollector
        self._trainer = None     # Optional RemoteTrainer

        self._env: Optional[OfficeOsEnvironment] = None
        self._agents: dict[str, LLMAgent] = {}
        self._obs = None

        # Tracking state
        self._episode = 0
        self._turn = 0
        self._role_index = 0
        self._reward_totals: dict[str, float] = {}
        self._kpi_history: list[dict] = []
        self._conversations: list[dict] = []
        self._action_log: list[dict] = []
        self._done = False

    def _init_env(self):
        """Lazily initialize the environment and agents."""
        self._env = OfficeOsEnvironment()

        effective_provider = self.provider
        if self.provider == "art":
            # ART uses anthropic provider for agent init, then overrides endpoint
            effective_provider = "anthropic"

        self._agents = {
            role: LLMAgent(
                role=role,
                model=self.model,
                provider=effective_provider if self.provider != "bedrock" else "bedrock",
                aws_region=self.aws_region,
            )
            for role in AGENT_ROLES
        }

        # If Ollama provider, set Ollama endpoint on each agent
        if self.provider == "ollama":
            for role, agent in self._agents.items():
                agent.set_ollama_endpoint(
                    model_name=self.ollama_model,
                    host=self.ollama_host,
                )
            logger.info(f"Ollama mode: all agents using {self.ollama_model} at {self.ollama_host}")

        # If ART provider, set the vLLM endpoint on each agent
        if self.provider == "art" and self.art_endpoint:
            vllm_base_url = self.art_endpoint.rstrip("/") + "/v1"
            for role, agent in self._agents.items():
                agent.set_vllm_endpoint(
                    base_url=vllm_base_url,
                    api_key=self.art_api_key or "dummy",
                    model_name=self.art_model,
                )
            logger.info(f"ART mode: all agents using {vllm_base_url} with model {self.art_model}")

        # Training mode: initialize trajectory collector + remote trainer
        if self._mode == "training":
            try:
                from training.collector import TrajectoryCollector
                from training.trainer import RemoteTrainer
                self._collector = TrajectoryCollector()
                self._trainer = RemoteTrainer(
                    collector=self._collector,
                    train_every_days=self._train_every,
                    northflank_endpoint=self._northflank_endpoint,
                )
                logger.info("Training mode: trajectory collector + remote trainer initialized")
            except ImportError as e:
                logger.warning(f"Training mode: could not import training modules: {e}")
                self._collector = None
                self._trainer = None

        # Inference mode: use trained LoRA models via vLLM
        if self._mode == "inference" and self._northflank_endpoint:
            vllm_base_url = self._northflank_endpoint.rstrip("/") + "/v1"
            # Roles that have trained LoRA adapters on the server
            _trained_roles = {"ceo", "dev", "marketing", "sales", "content", "hr"}
            for role, agent in self._agents.items():
                model_name = f"office-os-{role}" if role in _trained_roles else self.art_model
                agent.set_vllm_endpoint(
                    base_url=vllm_base_url,
                    api_key="dummy",
                    model_name=model_name,
                )
            logger.info(f"Inference mode: all agents using trained LoRA at {vllm_base_url}")

    def reset(self) -> dict:
        """Reset the environment and return full state dict."""
        self._init_env()
        self._obs = self._env.reset()

        self._episode += 1
        self._turn = 0
        self._role_index = 0
        self._reward_totals = {role: 0.0 for role in AGENT_ROLES}
        self._kpi_history = []
        self._conversations = []
        self._action_log = []
        self._done = False

        # Record initial KPIs
        kpis = self._get_kpis()
        self._kpi_history.append({**kpis, "step": 0})

        return self.get_state()

    def step(self) -> dict:
        """Execute one agent step. Returns step result dict."""
        # Auto-reset if env hasn't been initialized yet
        if self._env is None:
            logger.info("Auto-resetting: env not initialized")
            self.reset()

        if self._done:
            return {
                "type": "step",
                "activeAgent": None,
                "action": "",
                "target": "",
                "reasoning": "",
                "message": None,
                "kpis": self._get_kpis(),
                "reward": 0.0,
                "day": self._obs.day if self._obs else 0,
                "turn": self._turn,
                "phase": "done",
                "done": True,
                "events": [],
                "actionResult": {},
                "state": self.get_state(),
            }

        role = AGENT_ROLES[self._role_index % len(AGENT_ROLES)]
        agent = self._agents[role]
        self._role_index += 1
        self._turn += 1

        # Build observation dict for the agent
        obs_dict = {
            "agent_id": self._obs.agent_id,
            "day": self._obs.day,
            "phase": self._obs.phase,
            "kpis": self._obs.kpis,
            "budget_remaining": self._obs.budget_remaining,
            "recent_actions": self._obs.recent_actions,
            "messages": self._obs.messages,
            "events": self._obs.events,
            "role_data": self._obs.role_data,
            "last_action_result": self._obs.last_action_result,
            "done": self._obs.done,
            "reward": self._obs.reward,
        }

        # Agent decides (this calls the LLM — potentially slow)
        action_dict = agent.decide(obs_dict, self._turn)

        # Create and execute action
        action = OfficeOsAction(
            agent_id=role,
            action_type=action_dict["action_type"],
            target=action_dict.get("target", ""),
            parameters=action_dict.get("parameters", {}),
            reasoning=action_dict.get("reasoning", ""),
            message=action_dict.get("message"),
        )
        self._obs = self._env.step(action)

        # Track results
        result = self._obs.last_action_result
        reward = self._obs.reward
        self._reward_totals[role] += reward

        # Record action (include reward so reward_history is meaningful)
        self._action_log.append({
            "role": role,
            "action": action_dict["action_type"],
            "target": action_dict.get("target", ""),
            "reasoning": action_dict.get("reasoning", ""),
            "success": result.get("success", False),
            "detail": result.get("detail", ""),
            "reward": round(reward, 3),
            "day": self._obs.day,
            "turn": self._turn,
        })

        # Record reasoning entry
        self._conversations.append({
            "step": self._turn,
            "from_agent": role,
            "to_agent": "self",
            "text": action_dict.get("reasoning", f"{action_dict['action_type']} -> {action_dict.get('target', '')}"),
            "msg_type": "reasoning",
        })

        # Record action entry (action type + outcome + reward, used by RewardPanel dropdown)
        action_label = action_dict["action_type"].replace("_", " ")
        target = action_dict.get("target", "")
        outcome = result.get("detail", "") or ("success" if result.get("success") else "no effect")
        self._conversations.append({
            "step": self._turn,
            "from_agent": role,
            "to_agent": "self",
            "text": f"{action_label}{(' → ' + target) if target else ''} | {outcome}",
            "msg_type": "action",
            "reward": round(reward, 3),
        })

        # Record inter-agent messages
        collaborations = []
        if action_dict.get("message"):
            msg = action_dict["message"]
            to_agent = "all"
            msg_text = msg
            if ":" in msg:
                to_agent = msg.split(":")[0].strip()
                msg_text = ":".join(msg.split(":")[1:]).strip()
            self._conversations.append({
                "step": self._turn,
                "from_agent": role,
                "to_agent": to_agent,
                "text": msg_text,
                "msg_type": "chat",
            })
            # Track collaboration event
            if to_agent != "all":
                collaborations.append({
                    "from": role,
                    "to": to_agent,
                    "type": "message",
                    "reason": msg_text[:100],
                })

        # Check for target-based collaborations
        if action_dict.get("target"):
            target = action_dict.get("target", "").lower()
            for agent_role in AGENT_ROLES:
                if agent_role != role and agent_role in target:
                    collaborations.append({
                        "from": role,
                        "to": agent_role,
                        "type": "coordinate",
                        "reason": action_dict.get("action_type", ""),
                    })
                    break

        # Record trajectory for training mode
        if self._collector is not None:
            self._collector.record(
                role=role,
                system_prompt=getattr(agent, 'system_prompt', ''),
                user_message=getattr(agent, 'last_user_message', ''),
                assistant_response=action_dict,
                reward=reward,
                day=self._obs.day,
                turn=self._turn,
            )

        # Record KPI snapshot
        kpis = self._get_kpis()
        self._kpi_history.append({**kpis, "step": self._turn})

        # Check done
        self._done = self._obs.day > self.max_days or self._obs.done

        # End-of-episode: save trajectories and optionally trigger training
        if self._done and self._collector is not None:
            import os as _os
            data_dir = _os.path.join(_os.path.dirname(__file__), "..", "..", "office_os", "training_data")
            self._collector.save_jsonl(_os.path.join(data_dir, f"trajectories_ep{self._episode}.jsonl"))

        # Build step result
        step_result = {
            "type": "step",
            "activeAgent": role,
            "action": action_dict["action_type"],
            "target": action_dict.get("target", ""),
            "reasoning": action_dict.get("reasoning", ""),
            "message": action_dict.get("message"),
            "kpis": kpis,
            "reward": round(reward, 3),
            "day": self._obs.day,
            "turn": self._turn,
            "phase": self._obs.phase,
            "done": self._done,
            "events": self._obs.events,
            "actionResult": result,
            "collaborations": collaborations,  # NEW: collaboration events
            "training_status": self._get_training_status(),
            "state": self.get_state(),
        }

        return step_result

    def get_state(self) -> dict:
        """Return full state dict for frontend."""
        if self._env is None:
            return self._empty_state()

        market = self._env._market
        kpis = self._get_kpis()

        # Build agents dict
        agents = {}
        for role in AGENT_ROLES:
            info = AGENT_INFO.get(role, {})
            is_active = (
                self._role_index > 0
                and AGENT_ROLES[(self._role_index - 1) % len(AGENT_ROLES)] == role
                and not self._done
            )
            last_action = next(
                (a for a in reversed(self._action_log) if a["role"] == role),
                None,
            )
            agents[role] = {
                "agent_id": role,
                "name": info.get("name", role),
                "emoji": info.get("emoji", ""),
                "color": info.get("color", "#888"),
                "role": info.get("role", ""),
                "room": info.get("room", ""),
                "status": "active" if is_active else ("done" if self._done else "idle"),
                "current_task": last_action["action"] if last_action else "",
                "current_action": last_action["action"] if last_action else "",
                "target": last_action["target"] if last_action else "",
                "reasoning": last_action["reasoning"] if last_action else "",
                "reward": round(self._reward_totals.get(role, 0.0), 3),
                "reward_history": [
                    round(a.get("reward", 0), 3) if "reward" in a else 0
                    for a in self._action_log
                    if a["role"] == role
                ],
                "last_message": "",
            }

        # Pipeline
        pipeline = []
        for c in market.customers:
            pipeline.append({
                "name": c.name,
                "stage": c.stage,
                "budget": c.budget,
                "pain_point": c.pain_point,
                "industry": getattr(c, "industry", ""),
            })

        # Features
        features = []
        for f in market.features:
            features.append({
                "name": f.name,
                "description": f.description,
                "shipped": f.shipped,
                "turns_remaining": f.turns_remaining,
            })

        # Content
        content = []
        for p in market.content_pieces:
            content.append({
                "title": p.title,
                "type": p.content_type,
                "published": p.published,
                "quality": p.quality,
            })

        # Shared memory
        shared_memory = market.shared_memory.recent(20)

        # Active agent
        active_agent = None
        if self._role_index > 0 and not self._done:
            active_agent = AGENT_ROLES[(self._role_index - 1) % len(AGENT_ROLES)]

        return {
            "episode": self._episode,
            "step": self._turn,
            "day": market.day,
            "turn": self._turn,
            "phase": market.phase,
            "done": self._done,
            "agents": agents,
            "kpis": kpis,
            "kpi_history": self._kpi_history,
            "global_reward": round(sum(self._reward_totals.values()), 3),
            "reward_totals": {k: round(v, 3) for k, v in self._reward_totals.items()},
            "events": [],
            "conversations": self._conversations,
            "pipeline": pipeline,
            "features": features,
            "content": content,
            "shared_memory": shared_memory,
            "active_agent": active_agent,
            "max_days": self.max_days,
            "mode": self._mode,
        }

    def get_kpi_history(self) -> list[dict]:
        return self._kpi_history

    def get_conversations(self) -> list[dict]:
        return self._conversations

    def _get_kpis(self) -> dict:
        """Get current KPIs from market state."""
        if self._env is None:
            return self._default_kpis()
        return self._env._market.get_all_kpis()

    def _default_kpis(self) -> dict:
        return {
            "revenue": 0, "total_revenue": 0, "website_traffic": 1000,
            "conversion_rate": 0.02, "brand_awareness": 10,
            "product_stability": 1.0, "budget_remaining": 15000,
            "pipeline_value": 0, "features_shipped": 0,
            "content_published": 0, "active_campaigns": 0,
            "nps_score": 50, "customer_satisfaction": 0.5,
            "team_velocity": 1.0, "day": 1,
        }

    def _empty_state(self) -> dict:
        agents = {}
        for role in AGENT_ROLES:
            info = AGENT_INFO.get(role, {})
            agents[role] = {
                "agent_id": role,
                "name": info.get("name", role),
                "emoji": info.get("emoji", ""),
                "color": info.get("color", "#888"),
                "role": info.get("role", ""),
                "room": info.get("room", ""),
                "status": "idle",
                "current_task": "",
                "current_action": "",
                "target": "",
                "reasoning": "",
                "reward": 0,
                "reward_history": [],
                "last_message": "",
            }
        return {
            "episode": 0,
            "step": 0,
            "day": 1,
            "turn": 0,
            "phase": "morning_standup",
            "done": False,
            "agents": agents,
            "kpis": self._default_kpis(),
            "kpi_history": [],
            "global_reward": 0,
            "reward_totals": {role: 0.0 for role in AGENT_ROLES},
            "events": [],
            "conversations": [],
            "pipeline": [],
            "features": [],
            "content": [],
            "shared_memory": [],
            "active_agent": None,
            "max_days": self.max_days,
            "mode": self._mode,
        }

    def _get_training_status(self) -> Optional[dict]:
        """Return training status if in training mode, else None."""
        if self._collector is None:
            return None
        return {
            "collecting": True,
            "totalTrajectories": self._collector.total_count(),
            "pendingTrajectories": self._collector.pending_count(),
        }
