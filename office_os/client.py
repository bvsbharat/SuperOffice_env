# Copyright (c) Meta Platforms, Inc. and affiliates.
# All rights reserved.
#
# This source code is licensed under the BSD-style license found in the
# LICENSE file in the root directory of this source tree.

"""MarketVille Environment Client."""

from typing import Dict

from openenv.core.client_types import StepResult
from openenv.core.env_server.types import State
from openenv.core import EnvClient

from .models import OfficeOsAction, OfficeOsObservation


class OfficeOsEnv(
    EnvClient[OfficeOsAction, OfficeOsObservation]
):
    """
    Client for the MarketVille Environment.

    Maintains a persistent WebSocket connection to the environment server.
    Each client instance has its own dedicated simulation session.

    Example:
        >>> with OfficeOsEnv(base_url="http://localhost:8000") as client:
        ...     result = client.reset()
        ...     print(result.observation.kpis)
        ...
        ...     result = client.step(OfficeOsAction(
        ...         agent_id="dev",
        ...         action_type="BUILD_FEATURE",
        ...         target="SSO Integration",
        ...     ))
        ...     print(result.observation.last_action_result)
    """

    def _step_payload(self, action: OfficeOsAction) -> Dict:
        """Convert action to JSON payload."""
        payload = {
            "agent_id": action.agent_id,
            "action_type": action.action_type,
            "target": action.target,
            "parameters": action.parameters,
            "reasoning": action.reasoning,
        }
        if action.message:
            payload["message"] = action.message
        return payload

    def _parse_result(self, payload: Dict) -> StepResult[OfficeOsObservation]:
        """Parse server response into StepResult."""
        obs_data = payload.get("observation", {})
        observation = OfficeOsObservation(
            agent_id=obs_data.get("agent_id", ""),
            day=obs_data.get("day", 1),
            phase=obs_data.get("phase", ""),
            kpis=obs_data.get("kpis", {}),
            budget_remaining=obs_data.get("budget_remaining", 0.0),
            recent_actions=obs_data.get("recent_actions", []),
            messages=obs_data.get("messages", []),
            events=obs_data.get("events", []),
            role_data=obs_data.get("role_data", {}),
            last_action_result=obs_data.get("last_action_result", {}),
            done=payload.get("done", False),
            reward=payload.get("reward"),
            metadata=obs_data.get("metadata", {}),
        )

        return StepResult(
            observation=observation,
            reward=payload.get("reward"),
            done=payload.get("done", False),
        )

    def _parse_state(self, payload: Dict) -> State:
        """Parse server response into State object."""
        return State(
            episode_id=payload.get("episode_id"),
            step_count=payload.get("step_count", 0),
        )
