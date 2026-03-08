"""Trajectory collector for GRPO training.

Captures every agent decision (system prompt + observation -> action -> reward)
so we can train custom LoRA models via TRL GRPO on the Northflank H100.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class TurnRecord:
    """A single agent turn: prompt + observation -> action -> reward."""
    role: str
    system_prompt: str
    user_message: str
    assistant_response: dict  # The structured action dict
    reward: float
    day: int
    turn: int
    metadata: dict = field(default_factory=dict)


class TrajectoryCollector:
    """
    Collects agent turns during simulation for GRPO training.

    Each agent turn becomes a trajectory: system prompt + user message -> action -> reward.
    Trajectories are grouped by role so each agent gets its own training data.
    """

    def __init__(self):
        self._turns: dict[str, list[TurnRecord]] = {}  # role -> turns
        self._pending_batch: dict[str, list[TurnRecord]] = {}  # role -> turns since last drain

    def record(
        self,
        role: str,
        system_prompt: str,
        user_message: str,
        assistant_response: dict,
        reward: float,
        day: int,
        turn: int,
        metadata: dict | None = None,
    ):
        """Record a single agent turn."""
        record = TurnRecord(
            role=role,
            system_prompt=system_prompt,
            user_message=user_message,
            assistant_response=assistant_response,
            reward=reward,
            day=day,
            turn=turn,
            metadata=metadata or {},
        )
        self._turns.setdefault(role, []).append(record)
        self._pending_batch.setdefault(role, []).append(record)

    def drain_batch(self, role: str | None = None) -> dict[str, list[TurnRecord]]:
        """
        Drain and return pending turns since last drain, optionally for a specific role.
        Clears the pending batch after returning.
        """
        if role:
            batch = {role: self._pending_batch.pop(role, [])}
        else:
            batch = dict(self._pending_batch)
            self._pending_batch.clear()
        return batch

    def turns_for_role(self, role: str) -> list[TurnRecord]:
        """Get all collected turns for a role."""
        return self._turns.get(role, [])

    def pending_count(self, role: str | None = None) -> int:
        """Count pending turns since last drain."""
        if role:
            return len(self._pending_batch.get(role, []))
        return sum(len(v) for v in self._pending_batch.values())

    def total_count(self) -> int:
        """Total turns collected across all roles."""
        return sum(len(v) for v in self._turns.values())

    def save_jsonl(self, path: str):
        """Save all collected turns to a JSONL file for offline training."""
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w") as f:
            for role, turns in self._turns.items():
                for t in turns:
                    record = {
                        "role": t.role,
                        "system_prompt": t.system_prompt,
                        "user_message": t.user_message,
                        "assistant_response": t.assistant_response,
                        "reward": t.reward,
                        "day": t.day,
                        "turn": t.turn,
                        "metadata": t.metadata,
                    }
                    f.write(json.dumps(record) + "\n")
        logger.info(f"Saved {self.total_count()} trajectory records to {path}")
