"""Base agent with Smallville-style memory, reflection, planning, skill library, and working memory.

Enhanced with strategic mode detection (GROWTH/SURVIVAL/SPRINT) inspired by gstack's
cognitive mode switching pattern.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .memory import MemoryStream, SkillLibrary, WorkingMemory


def detect_strategic_mode(kpis: dict, budget: float, pipeline: list | None = None) -> str:
    """Auto-detect company strategic mode from KPIs.

    Returns one of: GROWTH, SURVIVAL, SPRINT.

    Logic:
    - SPRINT: A customer is at proposal/negotiation stage (close to closing)
    - SURVIVAL: Budget < $5000, or satisfaction < 0.4, or stability < 0.6
    - GROWTH: Default — things are stable enough to push forward
    """
    # Check for SPRINT conditions first (deal close to closing)
    if pipeline:
        close_stages = {"proposal", "negotiation"}
        for customer in pipeline:
            stage = customer.get("stage", "") if isinstance(customer, dict) else getattr(customer, "stage", "")
            if stage in close_stages:
                return "SPRINT"

    # Check for SURVIVAL conditions
    if budget < 5000:
        return "SURVIVAL"
    satisfaction = kpis.get("customer_satisfaction", 1.0)
    if satisfaction < 0.4:
        return "SURVIVAL"
    stability = kpis.get("product_stability", 1.0)
    if stability < 0.6:
        return "SURVIVAL"

    return "GROWTH"


@dataclass
class BaseAgent:
    """
    A Smallville-style agent with memory streams, reflection, planning,
    skill library, working memory, and strategic mode awareness.
    """

    role: str  # dev, marketing, sales, content, ceo, hr, customer
    name: str = ""
    memory: MemoryStream = field(default_factory=MemoryStream)
    skill_library: SkillLibrary = field(default_factory=SkillLibrary)
    working_memory: WorkingMemory = field(default_factory=WorkingMemory)
    strategic_mode: str = "GROWTH"
    _consecutive_actions: list[str] = field(default_factory=list)
    _last_reward: float = 0.0

    def __post_init__(self):
        if not self.name:
            role_names = {
                "dev": "Alex (Dev Lead)",
                "marketing": "Jordan (Marketing Lead)",
                "sales": "Sam (Sales Lead)",
                "content": "Casey (Content Lead)",
                "ceo": "Jeeya (CEO)",
                "hr": "Pat (HR/Planning Lead)",
                "customer": "Customer",
            }
            self.name = role_names.get(self.role, self.role.title())

    def update_strategic_mode(self, kpis: dict, budget: float, pipeline: list | None = None):
        """Update the agent's strategic mode based on current state."""
        self.strategic_mode = detect_strategic_mode(kpis, budget, pipeline)

    def track_action(self, action_type: str):
        """Track consecutive actions for repetition detection."""
        self._consecutive_actions.append(action_type)
        if len(self._consecutive_actions) > 5:
            self._consecutive_actions = self._consecutive_actions[-5:]

    @property
    def is_repeating(self) -> bool:
        """True if the agent has done the same action 3+ times in a row."""
        if len(self._consecutive_actions) < 3:
            return False
        return len(set(self._consecutive_actions[-3:])) == 1

    @property
    def repetition_warning(self) -> str:
        """Warning string if agent is repeating, empty otherwise."""
        if not self.is_repeating:
            return ""
        action = self._consecutive_actions[-1]
        return f"WARNING: You have used {action} {len(self._consecutive_actions)} times recently. Consider a different action."

    def should_reflect(self, reward: float, day_boundary: bool = False) -> bool:
        """Determine if the agent should trigger a reflection cycle.

        Triggers:
        - High reward (> 3.0) — learn from success
        - Negative reward (< -1.0) — learn from failure
        - Day boundary — natural reflection point
        - Large reward swing from last turn
        """
        if day_boundary:
            return True
        if reward > 3.0 or reward < -1.0:
            return True
        if abs(reward - self._last_reward) > 4.0:
            return True
        self._last_reward = reward
        return False

    def observe(self, turn: int, observation: str, importance: float = 5.0, associated_agents: list[str] | None = None):
        """Record an observation from the environment."""
        self.memory.add_observation(turn, observation, importance, associated_agents)

    def reflect(self, turn: int, insights: list[str]):
        """Store reflection insights (higher-level abstractions from observations)."""
        for insight in insights:
            self.memory.add_reflection(turn, insight)

    def plan(self, turn: int, plan_text: str):
        """Set the agent's current plan."""
        self.memory.add_plan(turn, plan_text)

    def record_skill(self, observation: str, action_type: str, target: str,
                     parameters: dict, reasoning: str, reward: float, turn: int) -> bool:
        """Record a successful action as a reusable skill."""
        return self.skill_library.maybe_store(
            observation=observation,
            action_type=action_type,
            target=target,
            parameters=parameters,
            reasoning=reasoning,
            reward=reward,
            turn=turn,
        )

    def get_context(self, current_turn: int, k: int = 10, query: str = "") -> dict:
        """Get the agent's current context for decision-making."""
        context = {
            "role": self.role,
            "name": self.name,
            "strategic_mode": self.strategic_mode,
            "current_plan": self.memory.current_plan(),
            "recent_reflections": self.memory.recent_reflections(3),
            "relevant_memories": self.memory.retrieve_relevant(current_turn, query=query, k=k),
            "memory_summary": self.memory.summary(),
        }

        # Add repetition warning if applicable
        if self.repetition_warning:
            context["repetition_warning"] = self.repetition_warning

        # Add skill library context
        if self.skill_library.skills:
            relevant_skills = self.skill_library.retrieve(query, k=3) if query else []
            context["skill_library"] = {
                "summary": self.skill_library.summary(),
                "relevant_skills": relevant_skills,
            }

        # Add working memory
        if self.working_memory.notes:
            context["working_memory"] = self.working_memory.read_all()

        return context

    def reset(self):
        """Reset agent state for a new episode."""
        self.memory = MemoryStream()
        self.skill_library = SkillLibrary()
        self.working_memory = WorkingMemory()
        self.strategic_mode = "GROWTH"
        self._consecutive_actions = []
        self._last_reward = 0.0
