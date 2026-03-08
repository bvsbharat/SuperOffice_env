"""Training integration for Office OS — TRL GRPO on Northflank H100."""

from .collector import TrajectoryCollector
from .trainer import RemoteTrainer

__all__ = ["TrajectoryCollector", "RemoteTrainer"]
