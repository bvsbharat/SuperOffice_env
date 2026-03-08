"""
SuperOffice GTM RL Environment

8-agent Go-To-Market simulation following the office_os Environment interface.
State machine drives KPIs deterministically; Claude bridge generates reasoning text.
"""

from __future__ import annotations

import random
from typing import Any, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


# ─── Agent / Room Config ──────────────────────────────────────────────────────

AGENT_ORDER = ["ceo", "hr", "marketing", "content", "dev", "sales", "scene", "customer"]

AGENT_INFO: dict[str, dict] = {
    "ceo":       {"name": "CEO",            "room": "Exec Suite",   "emoji": "👑", "color": "#ffd700", "role": "Strategist"},
    "hr":        {"name": "Planning/HR",    "room": "Ops Room",     "emoji": "📋", "color": "#00b4d8", "role": "Ops"},
    "marketing": {"name": "Marketing",      "room": "Campaign Hub", "emoji": "📣", "color": "#ff6b9d", "role": "Demand Gen"},
    "content":   {"name": "Content Builder","room": "Content Lab",  "emoji": "✍️", "color": "#9b5de5", "role": "Content"},
    "dev":       {"name": "Dev",            "room": "Dev Room",     "emoji": "⚙️", "color": "#00f5d4", "role": "Engineering"},
    "sales":     {"name": "Sales",          "room": "Sales Floor",  "emoji": "🤝", "color": "#f77f00", "role": "Revenue"},
    "scene":     {"name": "Scene/Scheme",   "room": "Server Room",  "emoji": "🎬", "color": "#06d6a0", "role": "Orchestrator"},
    "customer":  {"name": "Customer",       "room": "Lobby",        "emoji": "🧑‍💼", "color": "#fee440", "role": "Reward Oracle"},
}

PHASE_RANGES = {
    "standup":   (0, 1),
    "execution": (2, 18),
    "review":    (19, 19),
    "planning":  (20, 23),
}

SCENARIOS: dict[str, dict] = {
    "baseline":          {"multiplier": 1.0,  "penalty": 0.0,  "events": []},
    "competitor_launch": {"multiplier": 0.7,  "penalty": 0.0,  "events": [
        {"step": 4,  "type": "competitor_launch",  "description": "Rival product announced — leads cooling!"}
    ]},
    "series_a":          {"multiplier": 1.3,  "penalty": -0.5, "events": [
        {"step": 0,  "type": "investor_pressure",  "description": "Series A pressure: investors want 2× growth"}
    ]},
    "churn_spike":       {"multiplier": 0.6,  "penalty": 0.0,  "events": [
        {"step": 8,  "type": "churn_spike",         "description": "20% customer churn detected — Dev on damage control!"}
    ]},
    "viral_moment":      {"multiplier": 1.5,  "penalty": 0.0,  "events": [
        {"step": 12, "type": "viral_moment",         "description": "Viral post: 10× traffic flood incoming"}
    ]},
}

# Tasks per agent per phase
AGENT_TASKS: dict[str, dict[str, list[str]]] = {
    "ceo": {
        "standup":   ["Set weekly OKRs", "Align on priorities"],
        "execution": ["Define Q1 strategy", "Fundraise outreach", "Board update", "Hire exec team"],
        "review":    ["Review quarter KPIs", "Assess team performance"],
        "planning":  ["Plan next growth phase", "Revise OKRs", "Stakeholder alignment"],
    },
    "hr": {
        "standup":   ["Headcount review", "Team pulse check"],
        "execution": ["Hire SDR", "Onboard new PM", "Performance reviews", "Culture initiatives"],
        "review":    ["Attrition analysis", "Capacity review"],
        "planning":  ["Hiring plan Q2", "OKR cascade", "Budget allocation"],
    },
    "marketing": {
        "standup":   ["Campaign status", "Lead gen review"],
        "execution": ["Launch email campaign", "Run paid ads", "SEO push", "Partner co-marketing"],
        "review":    ["Campaign ROI analysis", "Lead quality review"],
        "planning":  ["Content calendar", "Channel strategy", "ABM target list"],
    },
    "content": {
        "standup":   ["Content backlog sync", "Brand voice check"],
        "execution": ["Write case study", "Publish blog post", "Record demo video", "Update docs"],
        "review":    ["Content performance audit", "SEO keyword review"],
        "planning":  ["Q2 content calendar", "Launch blog series", "Thought leadership plan"],
    },
    "dev": {
        "standup":   ["Sprint standup", "Blocker review"],
        "execution": ["Ship feature", "Fix critical bug", "API performance tuning", "Security patch"],
        "review":    ["Sprint retrospective", "Tech debt review"],
        "planning":  ["Roadmap grooming", "Architecture review", "Sprint planning"],
    },
    "sales": {
        "standup":   ["Pipeline review", "Deal status update"],
        "execution": ["Close enterprise deal", "Demo to prospect", "Follow up on MQLs", "Contract negotiation"],
        "review":    ["Win/loss analysis", "Forecast review"],
        "planning":  ["Territory planning", "Account targeting", "Sales enablement"],
    },
    "scene": {
        "standup":   ["System health check", "Integration status"],
        "execution": ["Optimize GTM pipeline", "Automate lead routing", "CRM sync", "Reporting dashboard"],
        "review":    ["Pipeline analytics", "System bottleneck analysis"],
        "planning":  ["Automation roadmap", "Tool stack review", "Data strategy"],
    },
    "customer": {
        "standup":   ["Support ticket review", "Churn risk scan"],
        "execution": ["Evaluate product fit", "Submit feature request", "Renewal negotiation", "Onboarding review"],
        "review":    ["NPS survey", "Satisfaction review"],
        "planning":  ["Success plan Q2", "Expansion opportunity", "Advocacy program"],
    },
}

# KPI delta per task type (baseline multiplier = 1.0)
KPI_DELTAS: dict[str, dict] = {
    # ceo tasks
    "Define Q1 strategy":      {"mrr": 500,   "mql": 0,   "cac": -5,   "nps": 1,  "win_rate": 0.002, "burn_rate": 0},
    "Fundraise outreach":      {"mrr": 2000,  "mql": 0,   "cac": 0,    "nps": 0,  "win_rate": 0.001, "burn_rate": 500},
    "Board update":            {"mrr": 0,     "mql": 0,   "cac": 0,    "nps": 0,  "win_rate": 0,     "burn_rate": 0},
    "Hire exec team":          {"mrr": 0,     "mql": 0,   "cac": 0,    "nps": 1,  "win_rate": 0.002, "burn_rate": 2000},
    # hr tasks
    "Hire SDR":                {"mrr": 0,     "mql": 5,   "cac": -10,  "nps": 0,  "win_rate": 0.005, "burn_rate": 1500},
    "Onboard new PM":          {"mrr": 0,     "mql": 0,   "cac": 0,    "nps": 2,  "win_rate": 0.003, "burn_rate": 1200},
    "Performance reviews":     {"mrr": 0,     "mql": 0,   "cac": 0,    "nps": 1,  "win_rate": 0.001, "burn_rate": 0},
    "Culture initiatives":     {"mrr": 0,     "mql": 0,   "cac": 0,    "nps": 3,  "win_rate": 0,     "burn_rate": 300},
    # marketing tasks
    "Launch email campaign":   {"mrr": 0,     "mql": 8,   "cac": 20,   "nps": 1,  "win_rate": 0,     "burn_rate": 1000},
    "Run paid ads":            {"mrr": 0,     "mql": 12,  "cac": 40,   "nps": 0,  "win_rate": 0,     "burn_rate": 2000},
    "SEO push":                {"mrr": 0,     "mql": 6,   "cac": 10,   "nps": 1,  "win_rate": 0,     "burn_rate": 500},
    "Partner co-marketing":    {"mrr": 500,   "mql": 10,  "cac": -20,  "nps": 2,  "win_rate": 0.005, "burn_rate": 800},
    # content tasks
    "Write case study":        {"mrr": 200,   "mql": 4,   "cac": -15,  "nps": 3,  "win_rate": 0.008, "burn_rate": 200},
    "Publish blog post":       {"mrr": 0,     "mql": 3,   "cac": -8,   "nps": 1,  "win_rate": 0.002, "burn_rate": 100},
    "Record demo video":       {"mrr": 300,   "mql": 5,   "cac": -20,  "nps": 2,  "win_rate": 0.010, "burn_rate": 300},
    "Update docs":             {"mrr": 0,     "mql": 0,   "cac": 0,    "nps": 4,  "win_rate": 0.003, "burn_rate": 50},
    # dev tasks
    "Ship feature":            {"mrr": 1500,  "mql": 2,   "cac": -5,   "nps": 5,  "win_rate": 0.012, "burn_rate": 0},
    "Fix critical bug":        {"mrr": 500,   "mql": 0,   "cac": 0,    "nps": 8,  "win_rate": 0.005, "burn_rate": 0},
    "API performance tuning":  {"mrr": 200,   "mql": 0,   "cac": 0,    "nps": 3,  "win_rate": 0.004, "burn_rate": 0},
    "Security patch":          {"mrr": 0,     "mql": 0,   "cac": 0,    "nps": 4,  "win_rate": 0.003, "burn_rate": 0},
    # sales tasks
    "Close enterprise deal":   {"mrr": 5000,  "mql": -3,  "cac": -50,  "nps": 2,  "win_rate": 0.020, "burn_rate": 0},
    "Demo to prospect":        {"mrr": 0,     "mql": -2,  "cac": 5,    "nps": 0,  "win_rate": 0.008, "burn_rate": 300},
    "Follow up on MQLs":       {"mrr": 1000,  "mql": -4,  "cac": -10,  "nps": 0,  "win_rate": 0.015, "burn_rate": 0},
    "Contract negotiation":    {"mrr": 2000,  "mql": -1,  "cac": -20,  "nps": 1,  "win_rate": 0.010, "burn_rate": 0},
    # scene tasks
    "Optimize GTM pipeline":   {"mrr": 300,   "mql": 3,   "cac": -30,  "nps": 1,  "win_rate": 0.006, "burn_rate": -500},
    "Automate lead routing":   {"mrr": 0,     "mql": 5,   "cac": -25,  "nps": 0,  "win_rate": 0.004, "burn_rate": -300},
    "CRM sync":                {"mrr": 0,     "mql": 2,   "cac": -10,  "nps": 0,  "win_rate": 0.003, "burn_rate": 0},
    "Reporting dashboard":     {"mrr": 0,     "mql": 0,   "cac": 0,    "nps": 2,  "win_rate": 0.002, "burn_rate": -200},
    # customer tasks
    "Evaluate product fit":    {"mrr": 0,     "mql": 0,   "cac": 0,    "nps": 5,  "win_rate": 0.005, "burn_rate": 0},
    "Submit feature request":  {"mrr": 0,     "mql": 0,   "cac": 0,    "nps": 2,  "win_rate": 0.002, "burn_rate": 0},
    "Renewal negotiation":     {"mrr": 3000,  "mql": 0,   "cac": 0,    "nps": -2, "win_rate": 0,     "burn_rate": 0},
    "Onboarding review":       {"mrr": 500,   "mql": 0,   "cac": 0,    "nps": 6,  "win_rate": 0.008, "burn_rate": 0},
    # standup / review / planning tasks (minimal delta)
    "Set weekly OKRs":         {"mrr": 0, "mql": 0, "cac": 0, "nps": 0, "win_rate": 0, "burn_rate": 0},
    "Align on priorities":     {"mrr": 0, "mql": 0, "cac": 0, "nps": 0, "win_rate": 0, "burn_rate": 0},
    "Headcount review":        {"mrr": 0, "mql": 0, "cac": 0, "nps": 0, "win_rate": 0, "burn_rate": 0},
    "Team pulse check":        {"mrr": 0, "mql": 0, "cac": 0, "nps": 1, "win_rate": 0, "burn_rate": 0},
    "Campaign status":         {"mrr": 0, "mql": 0, "cac": 0, "nps": 0, "win_rate": 0, "burn_rate": 0},
    "Lead gen review":         {"mrr": 0, "mql": 1, "cac": 0, "nps": 0, "win_rate": 0, "burn_rate": 0},
    "Content backlog sync":    {"mrr": 0, "mql": 0, "cac": 0, "nps": 0, "win_rate": 0, "burn_rate": 0},
    "Brand voice check":       {"mrr": 0, "mql": 0, "cac": 0, "nps": 0, "win_rate": 0, "burn_rate": 0},
    "Sprint standup":          {"mrr": 0, "mql": 0, "cac": 0, "nps": 0, "win_rate": 0, "burn_rate": 0},
    "Blocker review":          {"mrr": 0, "mql": 0, "cac": 0, "nps": 0, "win_rate": 0, "burn_rate": 0},
    "Pipeline review":         {"mrr": 0, "mql": 0, "cac": 0, "nps": 0, "win_rate": 0.001, "burn_rate": 0},
    "Deal status update":      {"mrr": 0, "mql": 0, "cac": 0, "nps": 0, "win_rate": 0, "burn_rate": 0},
    "System health check":     {"mrr": 0, "mql": 0, "cac": 0, "nps": 0, "win_rate": 0, "burn_rate": -100},
    "Integration status":      {"mrr": 0, "mql": 0, "cac": 0, "nps": 0, "win_rate": 0, "burn_rate": 0},
    "Support ticket review":   {"mrr": 0, "mql": 0, "cac": 0, "nps": 1, "win_rate": 0, "burn_rate": 0},
    "Churn risk scan":         {"mrr": 200, "mql": 0, "cac": 0, "nps": 2, "win_rate": 0, "burn_rate": 0},
}

# Handoff pairs (agent → agent that benefits from their output)
HANDOFF_PAIRS = {
    "marketing": "sales",
    "content":   "marketing",
    "dev":       "sales",
    "sales":     "customer",
    "scene":     "marketing",
    "hr":        "dev",
    "ceo":       "hr",
    "customer":  "ceo",
}

HANDOFF_MESSAGES = {
    "marketing→sales":   "Passing {mql} MQLs from {task}",
    "content→marketing": "Content asset ready: '{task}'",
    "dev→sales":         "Feature shipped: {task} — ready for demos",
    "sales→customer":    "Deal progressing: {task}",
    "scene→marketing":   "Pipeline optimized via {task}",
    "hr→dev":            "New hire onboarded from: {task}",
    "ceo→hr":            "Strategic direction set: {task}",
    "customer→ceo":      "Customer signal from {task}: reward={reward:.2f}",
}


# ─── Pydantic Models ──────────────────────────────────────────────────────────

class KPISnapshot(BaseModel):
    step: int = 0
    mrr: float = 50000.0
    cac: float = 800.0
    mql: int = 10
    nps: float = 25.0
    win_rate: float = 0.18
    burn_rate: float = 85000.0


class AgentState(BaseModel):
    agent_id: str
    name: str
    emoji: str
    color: str
    role: str
    room: str
    status: str = "idle"          # idle | active | done
    current_task: str = ""
    reward: float = 0.0
    reward_history: list[float] = Field(default_factory=list)
    last_message: str = ""


class SimEvent(BaseModel):
    step: int
    type: str
    description: str


class Message(BaseModel):
    step: int
    from_agent: str
    to_agent: str
    text: str
    msg_type: str = "chat"        # chat | handoff | event | reasoning


class EpisodeResult(BaseModel):
    episode: int
    global_reward: float
    cooperation_score: float
    final_kpis: KPISnapshot


class GTMState(BaseModel):
    episode: int = 0
    step: int = 0
    phase: str = "standup"
    scenario: str = "baseline"
    agents: dict[str, AgentState] = Field(default_factory=dict)
    kpis: KPISnapshot = Field(default_factory=KPISnapshot)
    kpi_history: list[KPISnapshot] = Field(default_factory=list)
    global_reward: float = 0.0
    cooperation_score: float = 0.5
    events: list[SimEvent] = Field(default_factory=list)
    conversations: list[Message] = Field(default_factory=list)
    episode_history: list[EpisodeResult] = Field(default_factory=list)
    active_agent: Optional[str] = None
    done: bool = False


# ─── Environment ──────────────────────────────────────────────────────────────

class GTMEnvironment:
    """
    8-agent GTM RL simulation following the office_os Environment interface.
    """

    SUPPORTS_CONCURRENT_SESSIONS: bool = True

    def __init__(self):
        self._state: GTMState = self._make_initial_state("baseline")

    # ── Public Interface ──────────────────────────────────────────────────────

    def reset(self, scenario: str = "baseline") -> GTMState:
        self._state = self._make_initial_state(scenario)
        return self._state

    def step(self) -> dict[str, Any]:
        """
        Execute one agent step. Returns a step result dict with:
        - state: updated GTMState
        - active_agent: agent_id
        - task: task string
        - kpi_delta: dict
        - reward: float
        - handoff_to: str | None
        - handoff_message: str | None
        - cooperation_score: float
        """
        s = self._state
        if s.done:
            return {"state": s, "active_agent": None, "task": "", "kpi_delta": {}, "reward": 0.0}

        active_id = AGENT_ORDER[s.step % 8]
        phase = _get_phase(s.step)
        s.phase = phase
        s.active_agent = active_id

        # Mark active agent
        for aid in AGENT_ORDER:
            s.agents[aid].status = "active" if aid == active_id else "idle"

        # Pick task
        task = self._pick_task(active_id, phase, s)
        s.agents[active_id].current_task = task

        # Inject scenario events
        events_at_step = [e for e in SCENARIOS[s.scenario]["events"] if e["step"] == s.step]
        for ev in events_at_step:
            sim_event = SimEvent(step=s.step, type=ev["type"], description=ev["description"])
            s.events.append(sim_event)
            s.conversations.append(Message(
                step=s.step,
                from_agent="system",
                to_agent="all",
                text=ev["description"],
                msg_type="event",
            ))

        # Compute KPI delta
        mult = SCENARIOS[s.scenario]["multiplier"]
        kpi_delta = self._compute_kpi_delta(task, mult, s)
        self._apply_kpi_delta(kpi_delta, s)

        # Reward
        reward = self._compute_reward(active_id, task, kpi_delta, s)
        s.agents[active_id].reward += reward
        s.agents[active_id].reward_history.append(round(reward, 3))

        # Cooperation bonus
        handoff_to = HANDOFF_PAIRS.get(active_id)
        handoff_msg = None
        cooperation_delta = 0.0
        if handoff_to and phase == "execution":
            cooperation_delta = 0.05
            s.cooperation_score = min(1.0, s.cooperation_score + cooperation_delta)
            tmpl = HANDOFF_MESSAGES.get(f"{active_id}→{handoff_to}", "{task}")
            handoff_msg = tmpl.format(
                task=task,
                mql=s.kpis.mql,
                reward=reward,
            )
            s.conversations.append(Message(
                step=s.step,
                from_agent=active_id,
                to_agent=handoff_to,
                text=handoff_msg,
                msg_type="handoff",
            ))

        # Save KPI snapshot
        snap = KPISnapshot(
            step=s.step,
            mrr=s.kpis.mrr,
            cac=s.kpis.cac,
            mql=s.kpis.mql,
            nps=s.kpis.nps,
            win_rate=s.kpis.win_rate,
            burn_rate=s.kpis.burn_rate,
        )
        s.kpi_history.append(snap)

        # Compute global reward
        s.global_reward = self._compute_global_reward(s)

        # Advance step
        s.step += 1

        # End of episode?
        if s.step >= 24:
            s.done = True
            s.active_agent = None
            for aid in AGENT_ORDER:
                s.agents[aid].status = "done"
            result = EpisodeResult(
                episode=s.episode,
                global_reward=s.global_reward,
                cooperation_score=s.cooperation_score,
                final_kpis=s.kpis.model_copy(),
            )
            s.episode_history.append(result)
            # Auto-advance episode for next reset
            s.episode += 1

        s.phase = _get_phase(s.step) if not s.done else "done"

        return {
            "state": s,
            "active_agent": active_id,
            "task": task,
            "kpi_delta": kpi_delta,
            "reward": reward,
            "handoff_to": handoff_to,
            "handoff_message": handoff_msg,
            "cooperation_score": s.cooperation_score,
            "events": [e.model_dump() for e in s.events if e.step == s.step - 1],
        }

    def get_state(self) -> GTMState:
        return self._state

    def set_scenario(self, scenario: str) -> GTMState:
        if scenario not in SCENARIOS:
            raise ValueError(f"Unknown scenario: {scenario}")
        current_episode = self._state.episode
        history = self._state.episode_history.copy()
        self._state = self._make_initial_state(scenario)
        self._state.episode = current_episode
        self._state.episode_history = history
        return self._state

    # ── Internal Helpers ──────────────────────────────────────────────────────

    def _make_initial_state(self, scenario: str) -> GTMState:
        agents = {}
        for aid in AGENT_ORDER:
            info = AGENT_INFO[aid]
            agents[aid] = AgentState(
                agent_id=aid,
                name=info["name"],
                emoji=info["emoji"],
                color=info["color"],
                role=info["role"],
                room=info["room"],
            )
        # Inject scenario start event
        evs = []
        for ev in SCENARIOS.get(scenario, {}).get("events", []):
            if ev["step"] == 0:
                evs.append(SimEvent(step=0, type=ev["type"], description=ev["description"]))

        return GTMState(
            scenario=scenario,
            agents=agents,
            events=evs,
            phase="standup",
        )

    def _pick_task(self, agent_id: str, phase: str, s: GTMState) -> str:
        tasks = AGENT_TASKS[agent_id][phase]
        # Scenario-based task override
        if s.scenario == "churn_spike" and s.step >= 8 and agent_id == "dev":
            return "Fix critical bug"
        if s.scenario == "viral_moment" and s.step >= 12 and agent_id == "dev":
            return "API performance tuning"
        if s.scenario == "competitor_launch" and s.step >= 4 and agent_id == "marketing":
            return "Run paid ads"
        # Pick based on KPI state
        if agent_id == "sales" and s.kpis.mql >= 15:
            return "Follow up on MQLs"
        if agent_id == "dev" and s.kpis.nps < 20:
            return "Fix critical bug"
        return tasks[s.step % len(tasks)]

    def _compute_kpi_delta(self, task: str, mult: float, s: GTMState) -> dict:
        base = KPI_DELTAS.get(task, {"mrr": 0, "mql": 0, "cac": 0, "nps": 0, "win_rate": 0, "burn_rate": 0})
        delta = {k: v * mult for k, v in base.items()}
        # Scenario-specific overrides
        if s.scenario == "churn_spike" and s.step >= 8:
            delta["mrr"] = delta.get("mrr", 0) * 0.5
            delta["nps"] = delta.get("nps", 0) - 3
        elif s.scenario == "series_a":
            delta["mrr"] = delta.get("mrr", 0) * 1.3
        elif s.scenario == "viral_moment" and s.step >= 12:
            delta["mql"] = int(delta.get("mql", 0) * 2)
        # Add noise
        delta["mrr"] = delta["mrr"] + random.gauss(0, 50)
        return delta

    def _apply_kpi_delta(self, delta: dict, s: GTMState):
        s.kpis.mrr = max(0, s.kpis.mrr + delta.get("mrr", 0))
        s.kpis.cac = max(50, s.kpis.cac + delta.get("cac", 0))
        s.kpis.mql = max(0, s.kpis.mql + int(delta.get("mql", 0)))
        s.kpis.nps = max(0, min(100, s.kpis.nps + delta.get("nps", 0)))
        s.kpis.win_rate = max(0, min(1, s.kpis.win_rate + delta.get("win_rate", 0)))
        s.kpis.burn_rate = max(0, s.kpis.burn_rate + delta.get("burn_rate", 0))

    def _compute_reward(self, agent_id: str, task: str, kpi_delta: dict, s: GTMState) -> float:
        mrr_contrib  = kpi_delta.get("mrr", 0) / 10000
        nps_contrib  = kpi_delta.get("nps", 0) / 10
        mql_contrib  = kpi_delta.get("mql", 0) / 20
        wr_contrib   = kpi_delta.get("win_rate", 0) * 5
        cac_contrib  = -kpi_delta.get("cac", 0) / 200    # lower CAC is better
        burn_contrib = -kpi_delta.get("burn_rate", 0) / 50000

        raw = mrr_contrib + nps_contrib + mql_contrib + wr_contrib + cac_contrib + burn_contrib
        # Cooperation bonus
        if HANDOFF_PAIRS.get(agent_id) and s.phase == "execution":
            raw += 0.1
        raw = max(-2.0, min(3.0, raw))
        return round(raw, 3)

    def _compute_global_reward(self, s: GTMState) -> float:
        mrr_score  = (s.kpis.mrr - 50000) / 50000
        nps_score  = (s.kpis.nps - 25) / 75
        wr_score   = (s.kpis.win_rate - 0.18) / 0.22
        cac_score  = (800 - s.kpis.cac) / 800
        coop_score = s.cooperation_score
        return round((mrr_score + nps_score + wr_score + cac_score + coop_score) / 5, 4)


# ── Utilities ──────────────────────────────────────────────────────────────────

def _get_phase(step: int) -> str:
    if step <= 1:
        return "standup"
    elif step <= 18:
        return "execution"
    elif step == 19:
        return "review"
    elif step <= 23:
        return "planning"
    return "done"
