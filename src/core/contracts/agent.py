"""Agent contract: the port between Application Use Cases and any agent backend.

It receives a stable ``AgentExecutionContext`` and returns a core ``AgentExecutionResult``. 
The backend is free to be OpenAI Agents, a Responses-based backend, a custom model,
or a ``FakeAgentBackend`` — the Application never knows which.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol, runtime_checkable

from src.core.entities.transport.asset import Asset
from src.core.entities.message import Message
from src.core.errors import DomainError
from src.core.values import AgentRunStatus

__all__ = [
    "AgentBackend",
    "AgentExecutionContext",
    "AgentExecutionResult",
    "AgentError",
    "Asset",
]


@dataclass
class AgentExecutionContext:
    """Stable task context handed to an agent backend.

    The backend executes against this context instead of a bag of loose
    arguments.
    """

    session_id: str
    conversation_id: str
    user_message: str
    recent_messages: list[Message] = field(default_factory=list)
    session_summary: str | None = None
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
    artifacts: list[Asset] = field(default_factory=list)
    status: AgentRunStatus = AgentRunStatus.SUCCEEDED
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
