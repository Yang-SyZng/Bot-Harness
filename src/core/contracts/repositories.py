"""Repository ports and the Unit of Work seam.

Application Use Cases depend on these Protocols (plus the concrete
``UnitOfWork``), never on SQLAlchemy sessions or MySQL directly.
"""

from __future__ import annotations

from abc import abstractmethod
from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from src.core.entities.conversation import Conversation, ConversationIdentity
from src.core.entities.message import IncomingMessage, Message
from src.core.entities.task import Task
from src.core.entities.user import User

__all__ = [
    "Repository",
    "UserRepository",
    "ConversationRepository",
    "TaskRepository",
    "MessageRepository",
    "UnitOfWork",
]


@runtime_checkable
class Repository(Protocol):
    """Marker base for a repository of a Core aggregate."""


@runtime_checkable
class UserRepository(Repository, Protocol):
    """Persistence port for :class:`~src.core.entities.user.User`."""

    async def get_or_create(
        self,
        external_id: str,
        *,
        provider: str,
        display_name: str | None = None,
    ) -> User:
        """Return the existing user for ``external_id`` or persist a new one."""
        ...


@runtime_checkable
class ConversationRepository(Repository, Protocol):
    """Persistence port for :class:`~src.core.entities.conversation.Conversation`."""

    async def get_or_create(
        self,
        identity: ConversationIdentity,
    ) -> Conversation:
        """Return the existing conversation for ``identity`` or persist one."""
        ...

    async def set_active_task(
        self,
        conversation_id: int,
        task_id: int,
    ) -> None:
        """Point the conversation's "currently active task" at ``task_id``."""
        ...


@runtime_checkable
class TaskRepository(Repository, Protocol):
    """Persistence port for :class:`~src.core.entities.task.Task`."""

    async def get(self, task_id: str) -> Task | None:
        ...  # pragma: no cover - protocol

    async def add(self, task: Task) -> None:
        ...  # pragma: no cover - protocol

    async def save(self, task: Task) -> None:
        ...  # pragma: no cover - protocol


@runtime_checkable
class MessageRepository(Repository, Protocol):
    """Persistence port for :class:`~src.core.entities.message.Message`."""

    async def add(self, message: Message) -> None:
        ...  # pragma: no cover - protocol

    async def list_for_task(
        self,
        task_id: str,
        *,
        limit: int | None = None,
    ) -> list[Message]:
        ...  # pragma: no cover - protocol


@dataclass
class UnitOfWork:
    """Bundle the repositories of one transaction boundary.

    Concrete implementations (e.g. :class:`MySQLUnitOfWork`) provide the real
    repositories at transaction start (``__aenter__``) and expose ``commit`` /
    ``rollback``. The repository attributes are ``None`` until a concrete
    implementation binds them.
    """

    users: UserRepository | None = None
    conversations: ConversationRepository | None = None
    tasks: TaskRepository | None = None
    messages: MessageRepository | None = None

    async def __aenter__(self) -> "UnitOfWork":
        return self

    async def __aexit__(self, *args: object) -> None:
        """Commit-or-rollback the transaction on scope exit."""
        exc = args[1] if len(args) > 1 else None
        if exc is None:
            await self.commit()
        else:
            await self.rollback()

    async def commit(self) -> None:
        """Commit the pending transaction."""

    @abstractmethod
    async def rollback(self) -> None:
        """Roll back the pending transaction."""
