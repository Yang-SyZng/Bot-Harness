"""Agent contract: the port between Application Use Cases and any agent backend.

It receives a stable ``AgentExecutionContext`` and returns a core ``AgentExecutionResult``. 
The backend is free to be OpenAI Agents, a Responses-based backend, a custom model,
or a ``FakeAgentBackend`` — the Application never knows which.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol, runtime_checkable

from src.core.entities.artifact import Artifact
from src.core.entities.message import ChatMessage
from src.core.errors import DomainError
from src.core.values import TaskStatus

__all__ = [
    "AgentBackend",
    "AgentExecutionContext",
    "AgentExecutionResult",
    "AgentRequest",
    "AgentResult",
    "AgentError",
    "Artifact",
]


@dataclass
class AgentExecutionContext:
    """Stable task context handed to an agent backend.

    The backend executes against this context instead of a bag of loose
    arguments.
    """

    task_id: str
    conversation_id: str
    user_message: str
    recent_messages: list[ChatMessage] = field(default_factory=list)
    task_summary: str | None = None
    attachments: list = field(default_factory=list)
    workspace: Path | None = None


class AgentError(DomainError):
    """An error raised (not converted) by an agent backend."""

    def __init__(self, message: str, kind: str = "agent") -> None:
        super().__init__(message)
        self.message = message
        self.kind = kind


@dataclass
class AgentExecutionResult:
    """Outcome of one agent execution."""

    text: str | None = None
    artifacts: list[Artifact] = field(default_factory=list)
    status: TaskStatus = TaskStatus.COMPLETED
    usage: object | None = None
    error: AgentError | None = None


@runtime_checkable
class AgentBackend(Protocol):
    """Port implemented by a concrete agent backend."""

    async def execute(
        self,
        context: AgentExecutionContext,
    ) -> AgentExecutionResult:
        """Execute the agent for ``context`` and return its result."""
        ...


# ---------------------------------------------------------------------------
# Legacy request/result objects migrated from the agent schema.
#
# These preserve the exact field set the current platform adapter / AgentService
# use. They will be superseded by ``AgentExecutionContext`` /
# ``AgentExecutionResult`` as the Application Use Cases land.
#
# We will remove these objects in the future.
# ---------------------------------------------------------------------------


@dataclass
class AgentRequest:
    """A normalized request submitted to the agent service (legacy shape). We will remove this objects in the future."""

    request_id: str
    user_id: str
    channel_id: str
    text: str | None = None
    file_path: Path | None = None
    workspace: Path | None = None


@dataclass
class AgentResult:
    """Final state and outputs of an agent execution (legacy shape). We will remove this objects in the future."""

    text: str | None = None
    artifacts: list[Artifact] = field(default_factory=list)
    status: TaskStatus | str = TaskStatus.COMPLETED
    error: str | None = None
