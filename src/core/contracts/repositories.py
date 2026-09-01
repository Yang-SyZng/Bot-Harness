"""Repository ports and the Unit of Work seam.

Application Use Cases depend on these Protocols (plus the concrete
``UnitOfWork``), never on SQLAlchemy sessions or MySQL directly.
"""

from __future__ import annotations

from abc import abstractmethod
from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from src.core.entities.conversation import Conversation
from src.core.entities.message import Message
from src.core.entities.session import Session
from src.core.entities.transport.address import ConversationAddress
from src.core.entities.transport.asset import Asset
from src.core.entities.transport.envelope import MessageEnvelope

__all__ = [
    "Repository",
    "ConversationRepository",
    "EnvelopeRepository",
    "MessageRepository",
    "SessionRepository",
    "AssetRepository",
    "UnitOfWork",
]


@runtime_checkable
class Repository(Protocol):
    """Marker base for a repository of a Core aggregate."""


@runtime_checkable
class ConversationRepository(Repository, Protocol):
    """Persistence port for :class:`~src.core.entities.conversation.Conversation`."""

    async def add(self, conversation: Conversation) -> None:
        ...  # pragma: no cover - protocol

    async def get(self, conversation_id: str) -> Conversation | None:
        ...  # pragma: no cover - protocol

    async def get_or_create_by_address(self, address: ConversationAddress) -> Conversation:
        """Return the existing conversation for ``address`` or persist a new one."""
        ...

    async def save(self, conversation: Conversation) -> None:
        ...  # pragma: no cover - protocol


@runtime_checkable
class EnvelopeRepository(Repository, Protocol):
    """Persistence port for :class:`~src.core.entities.transport.envelope.MessageEnvelope`."""

    async def add(self, envelope: MessageEnvelope) -> None:
        ...  # pragma: no cover - protocol

    async def get(self, envelope_id: str) -> MessageEnvelope | None:
        ...  # pragma: no cover - protocol

    async def list_by_conversation(
        self,
        conversation_id: str,
        *,
        after_envelope_id: str | None = None,
        limit: int | None = None,
    ) -> list[MessageEnvelope]:
        """Return the envelopes of a conversation (a channel/DM aggregates all)."""
        ...  # pragma: no cover - protocol


@runtime_checkable
class MessageRepository(Repository, Protocol):
    """Persistence port for :class:`~src.core.entities.message.Message`.

    Messages are read out of envelopes for a session; they are not queries by a
    conversation id (ownership lives on the envelope / session relation).
    """

    async def get(self, message_id: str) -> Message | None:
        ...  # pragma: no cover - protocol

    async def list_for_envelopes(
        self,
        envelope_ids: list[str],
        *,
        limit: int | None = None,
    ) -> list[Message]:
        """Return the messages contained in the given envelopes, in order."""
        ...  # pragma: no cover - protocol


@runtime_checkable
class SessionRepository(Repository, Protocol):
    """Persistence port for :class:`~src.core.entities.session.Session`."""

    async def add(self, session: Session) -> None:
        ...  # pragma: no cover - protocol

    async def get(self, session_id: str) -> Session | None:
        ...  # pragma: no cover - protocol

    async def save(self, session: Session) -> None:
        ...  # pragma: no cover - protocol

    async def get_active(
        self,
        *,
        conversation_id: str,
        user_id: str | None = None,
    ) -> Session | None:
        """Return the currently active session for the conversation, if any."""
        ...

    async def list_by_conversation(self, conversation_id: str) -> list[Session]:
        ...  # pragma: no cover - protocol


@runtime_checkable
class AssetRepository(Repository, Protocol):
    """Persistence port for :class:`~src.core.entities.asset.Asset`."""

    async def add(self, asset: Asset) -> None:
        ...  # pragma: no cover - protocol

    async def get(self, asset_id: str) -> Asset | None:
        ...  # pragma: no cover - protocol

    async def list_by_sha256(self, sha256: str) -> list[Asset]:
        """Return persisted assets with the given content hash (for dedup)."""
        ...  # pragma: no cover - protocol


@dataclass
class UnitOfWork:
    """Bundle the repositories of one transaction boundary.

    Concrete implementations (e.g. :class:`MySQLUnitOfWork`) provide the real
    repositories at transaction start (``__aenter__``) and expose ``commit`` /
    ``rollback``. The repository attributes are ``None`` until a concrete
    implementation binds them.
    """

    conversations: ConversationRepository | None = None
    messages: MessageRepository | None = None
    sessions: SessionRepository | None = None
    assets: AssetRepository | None = None
    envelopes: EnvelopeRepository | None = None

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
