"""Base agent with Smallville-style memory, reflection, planning, skill library, and working memory."""

from __future__ import annotations

from dataclasses import dataclass, field

from .memory import MemoryStream, SkillLibrary, WorkingMemory


@dataclass
class BaseAgent:
    """
    A Smallville-style agent with memory streams, reflection, planning,
    skill library, and working memory.

    Enhanced with Voyager-VRAM (#50) patterns:
    - SkillLibrary: stores successful action patterns for reuse
    - WorkingMemory: persistent scratchpad across turns
    """

    role: str  # dev, marketing, sales, content
    name: str = ""
    memory: MemoryStream = field(default_factory=MemoryStream)
    skill_library: SkillLibrary = field(default_factory=SkillLibrary)
    working_memory: WorkingMemory = field(default_factory=WorkingMemory)

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
            "current_plan": self.memory.current_plan(),
            "recent_reflections": self.memory.recent_reflections(3),
            "relevant_memories": self.memory.retrieve_relevant(current_turn, query=query, k=k),
            "memory_summary": self.memory.summary(),
        }

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
