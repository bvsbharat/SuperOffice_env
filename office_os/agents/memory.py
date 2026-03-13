"""Smallville-style memory streams with skill library and working memory.

Enhanced with:
- Auto-importance scoring based on content signals (deals, failures, milestones)
- Type-aware retrieval weighting (reflections > plans > observations)
- Negative skill tracking (anti-patterns to avoid)

Three memory systems:
- MemoryStream: Observations, reflections, plans with keyword-based semantic retrieval
- SkillLibrary: Stores and retrieves successful action patterns + anti-patterns
- WorkingMemory: Persistent scratchpad across turns
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass, field


# ── Importance signal keywords ────────────────────────────────────────

_HIGH_IMPORTANCE_SIGNALS = {
    "closed", "shipped", "deal", "revenue", "churned", "lost", "critical",
    "urgent", "bug", "escalat", "pivot", "hired", "blocker", "resolved",
}
_LOW_IMPORTANCE_SIGNALS = {
    "refactor", "docs", "review", "sync", "track", "research",
}


def _auto_importance(description: str, base: float = 5.0) -> float:
    """Score importance based on content signals.

    High-impact events (deals, shipping, churn) get boosted.
    Low-impact events (docs, tracking) stay at base or below.
    """
    text = description.lower()
    score = base

    for signal in _HIGH_IMPORTANCE_SIGNALS:
        if signal in text:
            score = min(score + 1.5, 10.0)
            break  # One boost per direction

    for signal in _LOW_IMPORTANCE_SIGNALS:
        if signal in text:
            score = max(score - 0.5, 1.0)
            break

    # Revenue/deal mentions get extra boost
    if "closed_won" in text or "closed deal" in text:
        score = min(score + 2.0, 10.0)
    if "churned" in text or "closed_lost" in text:
        score = min(score + 2.0, 10.0)

    return round(score, 1)


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


@dataclass
class Skill:
    """A reusable action pattern that was previously successful."""

    observation_pattern: str  # What situation triggered this skill
    action_type: str          # What action was taken
    target: str               # Target of the action
    parameters: dict = field(default_factory=dict)
    reasoning: str = ""       # Why it worked
    reward: float = 0.0       # How much reward it earned
    use_count: int = 0        # How many times it's been retrieved
    turn_created: int = 0

    def __repr__(self) -> str:
        return f"[Skill: {self.action_type}->{self.target} r={self.reward:.1f}]"


@dataclass
class AntiPattern:
    """An action pattern that led to negative outcomes — avoid repeating."""

    observation_pattern: str
    action_type: str
    target: str
    reasoning: str = ""
    penalty: float = 0.0  # How much negative reward it earned
    turn_created: int = 0

    def __repr__(self) -> str:
        return f"[AntiPattern: {self.action_type}->{self.target} p={self.penalty:.1f}]"


class SkillLibrary:
    """Stores and retrieves successful action patterns and anti-patterns.

    When an agent's action gets high reward (>threshold), the (observation, action, reasoning)
    is saved as a reusable skill. On future turns, relevant skills are retrieved to
    provide examples of what worked before.

    Anti-patterns track actions that led to negative outcomes so agents can avoid them.
    """

    def __init__(self, reward_threshold: float = 5.0, max_skills: int = 50,
                 anti_pattern_threshold: float = -2.0, max_anti_patterns: int = 20):
        self.skills: list[Skill] = []
        self.reward_threshold = reward_threshold
        self.max_skills = max_skills
        self.anti_patterns: list[AntiPattern] = []
        self.anti_pattern_threshold = anti_pattern_threshold
        self.max_anti_patterns = max_anti_patterns

    def maybe_store(
        self,
        observation: str,
        action_type: str,
        target: str,
        parameters: dict,
        reasoning: str,
        reward: float,
        turn: int,
    ) -> bool:
        """Store a skill if the reward exceeds threshold. Returns True if stored."""
        # Store anti-pattern if reward is very negative
        if reward <= self.anti_pattern_threshold:
            self._store_anti_pattern(observation, action_type, target, reasoning, reward, turn)

        if reward < self.reward_threshold:
            return False

        # Don't store duplicates (same action_type + similar observation)
        for existing in self.skills:
            if existing.action_type == action_type and existing.target == target:
                # Update if better reward
                if reward > existing.reward:
                    existing.reward = reward
                    existing.reasoning = reasoning
                    existing.observation_pattern = observation[:200]
                return False

        skill = Skill(
            observation_pattern=observation[:200],
            action_type=action_type,
            target=target,
            parameters=parameters,
            reasoning=reasoning,
            reward=reward,
            turn_created=turn,
        )
        self.skills.append(skill)

        # Evict lowest-reward skills if over limit
        if len(self.skills) > self.max_skills:
            self.skills.sort(key=lambda s: s.reward, reverse=True)
            self.skills = self.skills[:self.max_skills]

        return True

    def _store_anti_pattern(self, observation: str, action_type: str, target: str,
                            reasoning: str, penalty: float, turn: int):
        """Store a negative outcome as an anti-pattern."""
        # Don't store duplicates
        for existing in self.anti_patterns:
            if existing.action_type == action_type and existing.target == target:
                if penalty < existing.penalty:
                    existing.penalty = penalty
                    existing.reasoning = reasoning
                return

        self.anti_patterns.append(AntiPattern(
            observation_pattern=observation[:200],
            action_type=action_type,
            target=target,
            reasoning=reasoning,
            penalty=penalty,
            turn_created=turn,
        ))

        if len(self.anti_patterns) > self.max_anti_patterns:
            self.anti_patterns.sort(key=lambda a: a.penalty)
            self.anti_patterns = self.anti_patterns[:self.max_anti_patterns]

    def retrieve(self, current_observation: str, k: int = 3) -> list[dict]:
        """Retrieve top-K skills relevant to the current observation using keyword matching."""
        if not self.skills:
            return []

        obs_keywords = _extract_keywords(current_observation)
        scored = []
        for skill in self.skills:
            pattern_keywords = _extract_keywords(skill.observation_pattern)
            overlap = len(obs_keywords & pattern_keywords)
            if overlap > 0 or not obs_keywords:
                score = overlap * 2.0 + skill.reward * 0.5
                scored.append((score, skill))

        scored.sort(key=lambda x: x[0], reverse=True)
        results = []
        for score, skill in scored[:k]:
            skill.use_count += 1
            results.append({
                "action_type": skill.action_type,
                "target": skill.target,
                "parameters": skill.parameters,
                "reasoning": skill.reasoning,
                "reward": skill.reward,
                "relevance_score": round(score, 2),
            })
        return results

    def retrieve_anti_patterns(self, current_observation: str, k: int = 2) -> list[dict]:
        """Retrieve anti-patterns relevant to the current situation."""
        if not self.anti_patterns:
            return []

        obs_keywords = _extract_keywords(current_observation)
        scored = []
        for ap in self.anti_patterns:
            pattern_keywords = _extract_keywords(ap.observation_pattern)
            overlap = len(obs_keywords & pattern_keywords)
            if overlap > 0:
                score = overlap * 2.0 + abs(ap.penalty) * 0.5
                scored.append((score, ap))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [
            {
                "action_type": ap.action_type,
                "target": ap.target,
                "reasoning": ap.reasoning,
                "penalty": ap.penalty,
            }
            for _, ap in scored[:k]
        ]

    def summary(self) -> dict:
        return {
            "total_skills": len(self.skills),
            "total_anti_patterns": len(self.anti_patterns),
            "avg_reward": round(sum(s.reward for s in self.skills) / max(1, len(self.skills)), 2),
            "top_actions": Counter(s.action_type for s in self.skills).most_common(3),
        }


class WorkingMemory:
    """Persistent scratchpad that agents can explicitly write to across turns.

    Separate from the memory stream — this is structured working memory
    that the agent controls directly.
    """

    def __init__(self, max_notes: int = 10):
        self.notes: dict[str, str] = {}  # key -> note content
        self.max_notes = max_notes

    def write(self, key: str, content: str):
        """Write or update a note."""
        self.notes[key] = content
        # Evict oldest if over limit
        if len(self.notes) > self.max_notes:
            oldest_key = next(iter(self.notes))
            del self.notes[oldest_key]

    def read(self, key: str) -> str:
        """Read a specific note."""
        return self.notes.get(key, "")

    def read_all(self) -> dict[str, str]:
        """Read all notes."""
        return dict(self.notes)

    def delete(self, key: str):
        """Delete a note."""
        self.notes.pop(key, None)

    def summary(self) -> str:
        """Get a formatted summary of all notes."""
        if not self.notes:
            return "No working memory notes."
        lines = [f"- {k}: {v}" for k, v in self.notes.items()]
        return "\n".join(lines)


def _extract_keywords(text: str) -> set[str]:
    """Extract meaningful keywords from text for semantic matching."""
    # Lowercase and split into words
    words = re.findall(r'[a-z_]+', text.lower())
    # Filter out common stop words and very short words
    stop_words = {
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
        'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
        'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
        'not', 'no', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'each',
        'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such',
        'than', 'too', 'very', 'just', 'about', 'up', 'out', 'if', 'then',
        'this', 'that', 'these', 'those', 'it', 'its',
    }
    return {w for w in words if len(w) > 2 and w not in stop_words}


class MemoryStream:
    """
    Stores and retrieves memories using recency + importance + keyword scoring.

    Enhanced with:
    - Auto-importance scoring based on content signals
    - Type-aware retrieval weighting (reflections weighted higher)

    Following the Stanford Generative Agents architecture:
    - Observations: what happened
    - Reflections: higher-level insights derived from observations
    - Plans: what the agent intends to do
    """

    # Retrieval weight by memory type — reflections and plans are more valuable
    _TYPE_WEIGHTS = {
        "reflection": 1.5,
        "plan": 1.3,
        "observation": 1.0,
    }

    def __init__(self, max_memories: int = 200):
        self.memories: list[Memory] = []
        self.max_memories = max_memories

    def add(self, turn: int, description: str, memory_type: str, importance: float = 5.0, associated_agents: list[str] | None = None):
        """Add a new memory with auto-importance adjustment."""
        # Apply auto-importance scoring based on content
        adjusted_importance = _auto_importance(description, importance)

        mem = Memory(
            turn=turn,
            description=description,
            memory_type=memory_type,
            importance=adjusted_importance,
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
        Retrieve top-K memories scored by recency + importance + keyword relevance.

        Enhanced: type-aware weighting gives reflections and plans priority over observations.
        """
        if not self.memories:
            return []

        query_keywords = _extract_keywords(query) if query else set()

        scored = []
        for mem in self.memories:
            age = max(current_turn - mem.turn, 0)
            recency_score = math.exp(-0.01 * age)

            # Type-aware weighting
            type_weight = self._TYPE_WEIGHTS.get(mem.memory_type, 1.0)
            total_score = mem.importance * recency_score * type_weight

            # Keyword relevance boost
            if query_keywords:
                mem_keywords = _extract_keywords(mem.description)
                overlap = len(query_keywords & mem_keywords)
                total_score += overlap * 3.0  # Keyword match bonus

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
