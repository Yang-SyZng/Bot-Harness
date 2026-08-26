"""Core domain and contracts for the application.

This package is the **dependency-free** heart of the application. Core must not
import any concrete platform's SDK, SQLAlchemy, Redis, the OpenAI SDK, any HTTP
client, or a global Settings singleton. Concrete platforms, persistence, cache
and agent integrations live in ``plugins`` / existing adapter layers and depend
on Core — never the other way around.

Package layout:

- ``core.entities``: platform-agnostic domain objects (User, Conversation,
  Task, Message, IncomingMessage, Artifact, ...).
- ``core.contracts``: Ports/Protocols the application depends on (AgentBackend,
  TaskQueue, ResultPublisher, UnitOfWork, Repositories).
- ``core.values``: platform-independent value definitions (TaskStatus, ...).
- ``core.errors``: Core-level error types.
"""

from src.core.errors import (
    DomainError,
    TaskNotFoundError,
)
from src.core.values import (
    AttachmentKind,
    TaskStatus,
)

__all__ = [
    "DomainError",
    "TaskNotFoundError",
    "AttachmentKind",
    "TaskStatus",
]
