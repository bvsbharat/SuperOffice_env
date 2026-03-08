"""Smallville-style memory streams for agents.

Each agent maintains a stream of observations, reflections, and plans.
Memories are retrieved by recency, importance, and relevance.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass
class Memory:
    """A single memory entry."""

    turn: int
    description: str
    memory_type: str  # "observation", "reflection", "plan"
    importance: float = 5.0  # 1-10
    associated_agents: list[str] = field(default_factory=list)

    def __repr__(self) -> str:
        return f"[{self.memory_type}@t{self.turn}] {self.description[:60]}"


class MemoryStream:
    """
    Stores and retrieves memories using recency + importance scoring.

    Following the Stanford Generative Agents architecture:
    - Observations: what happened
    - Reflections: higher-level insights derived from observations
    - Plans: what the agent intends to do
    """

    def __init__(self, max_memories: int = 200):
        self.memories: list[Memory] = []
        self.max_memories = max_memories

    def add(self, turn: int, description: str, memory_type: str, importance: float = 5.0, associated_agents: list[str] | None = None):
        """Add a new memory."""
        mem = Memory(
            turn=turn,
            description=description,
            memory_type=memory_type,
            importance=importance,
            associated_agents=associated_agents or [],
        )
        self.memories.append(mem)

        # Evict oldest low-importance memories if over limit
        if len(self.memories) > self.max_memories:
            self.memories.sort(key=lambda m: m.importance)
            self.memories = self.memories[len(self.memories) - self.max_memories :]

    def add_observation(self, turn: int, description: str, importance: float = 5.0, associated_agents: list[str] | None = None):
        self.add(turn, description, "observation", importance, associated_agents)

    def add_reflection(self, turn: int, description: str, importance: float = 8.0, associated_agents: list[str] | None = None):
        self.add(turn, description, "reflection", importance, associated_agents)

    def add_plan(self, turn: int, description: str, importance: float = 7.0):
        self.add(turn, description, "plan", importance)

    def retrieve_relevant(self, current_turn: int, query: str = "", k: int = 10) -> list[dict]:
        """
        Retrieve top-K memories scored by recency + importance.

        Recency uses exponential decay: score = importance * decay(age).
        """
        if not self.memories:
            return []

        scored = []
        for mem in self.memories:
            age = max(current_turn - mem.turn, 0)
            recency_score = math.exp(-0.01 * age)  # Gentle decay
            total_score = mem.importance * recency_score
            scored.append((total_score, mem))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [
            {
                "description": mem.description,
                "type": mem.memory_type,
                "importance": mem.importance,
                "turn": mem.turn,
                "score": round(score, 2),
            }
            for score, mem in scored[:k]
        ]

    def recent_reflections(self, n: int = 3) -> list[str]:
        """Get the N most recent reflections."""
        reflections = [m for m in self.memories if m.memory_type == "reflection"]
        reflections.sort(key=lambda m: m.turn, reverse=True)
        return [r.description for r in reflections[:n]]

    def current_plan(self) -> str:
        """Get the most recent plan."""
        plans = [m for m in self.memories if m.memory_type == "plan"]
        if plans:
            plans.sort(key=lambda m: m.turn, reverse=True)
            return plans[0].description
        return ""

    def summary(self) -> dict:
        """Return a summary of the memory stream."""
        return {
            "total_memories": len(self.memories),
            "observations": len([m for m in self.memories if m.memory_type == "observation"]),
            "reflections": len([m for m in self.memories if m.memory_type == "reflection"]),
            "plans": len([m for m in self.memories if m.memory_type == "plan"]),
        }
