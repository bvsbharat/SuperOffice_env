"""Base agent with Smallville-style memory, reflection, and planning."""

from __future__ import annotations

from dataclasses import dataclass, field

from .memory import MemoryStream


@dataclass
class BaseAgent:
    """
    A Smallville-style agent with memory streams, reflection, and planning.

    Each agent role (dev, marketing, sales, content) extends this base
    with role-specific behavior. The agent maintains a memory stream and
    can reflect on past events to form higher-level insights.
    """

    role: str  # dev, marketing, sales, content
    name: str = ""
    memory: MemoryStream = field(default_factory=MemoryStream)

    def __post_init__(self):
        if not self.name:
            role_names = {
                "dev": "Alex (Dev Lead)",
                "marketing": "Jordan (Marketing Lead)",
                "sales": "Sam (Sales Lead)",
                "content": "Casey (Content Lead)",
            }
            self.name = role_names.get(self.role, self.role.title())

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

    def get_context(self, current_turn: int, k: int = 10) -> dict:
        """Get the agent's current context for decision-making."""
        return {
            "role": self.role,
            "name": self.name,
            "current_plan": self.memory.current_plan(),
            "recent_reflections": self.memory.recent_reflections(3),
            "relevant_memories": self.memory.retrieve_relevant(current_turn, k=k),
            "memory_summary": self.memory.summary(),
        }

    def reset(self):
        """Reset agent state for a new episode."""
        self.memory = MemoryStream()
