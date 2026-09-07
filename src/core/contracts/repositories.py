"""Repository ports and the Unit of Work seam.

Application Use Cases depend on these Protocols (plus the concrete
``UnitOfWork``), never on SQLAlchemy sessions or MySQL directly.
"""

from __future__ import annotations

from abc import abstractmethod
from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from src.core.entities.agent_run import AgentRun
from src.core.entities.outbox_event import OutboxEvent
from src.core.entities.conversation import Conversation
from src.core.entities.message import Message
from src.core.entities.session import Session
from src.core.entities.session_envelope import SessionEnvelope
from src.core.entities.transport.address import ConversationAddress
from src.core.entities.transport.asset import Asset
from src.core.entities.transport.envelope import MessageEnvelope
from src.core.values import SessionEnvelopeRole

__all__ = [
    "Repository",
    "ConversationRepository",
    "EnvelopeRepository",
    "MessageRepository",
    "SessionRepository",
    "SessionEnvelopeRepository",
    "AssetRepository",
    "AgentRunRepository",
    "OutboxRepository",
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
        """Get/create and serialize routing for this address until UoW exit."""
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

    async def get_by_idempotency_key(
        self, conversation_id: str, idempotency_key: str
    ) -> MessageEnvelope | None:
        ...

    async def get_by_external_message_id(
        self,
        *,
        conversation_id: str,
        external_message_id: str,
    ) -> MessageEnvelope | None:
        """Resolve a platform reply target within one Conversation."""
        ...

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

    This repository owns Message content only. Conversation and Session
    membership are expressed by Envelope repositories.
    """

    async def add(self, message: Message) -> None:
        ...  # pragma: no cover - protocol

    async def get(self, message_id: str) -> Message | None:
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
        owner_user_id: str | None = None,
    ) -> Session | None:
        """Return the currently active session for the conversation, if any."""
        ...

    async def list_by_conversation(self, conversation_id: str) -> list[Session]:
        ...  # pragma: no cover - protocol


@runtime_checkable
class SessionEnvelopeRepository(Repository, Protocol):
    """Persistence port for ordered Session-to-Envelope membership."""

    async def attach(
        self,
        *,
        session_id: str,
        envelope_id: str,
        relation_role: SessionEnvelopeRole = SessionEnvelopeRole.INPUT,
    ) -> SessionEnvelope:
        """Attach once and return the existing or newly-created relation."""
        ...

    async def list_by_session(self, session_id: str) -> list[SessionEnvelope]:
        ...  # pragma: no cover - protocol

    async def list_session_ids(self, envelope_id: str) -> list[str]:
        ...  # pragma: no cover - protocol


@runtime_checkable
class AgentRunRepository(Repository, Protocol):
    """Persistence port for concrete Agent execution attempts."""

    async def add(self, run: AgentRun) -> None:
        ...  # pragma: no cover - protocol

    async def get(self, run_id: str) -> AgentRun | None:
        ...  # pragma: no cover - protocol

    async def save(self, run: AgentRun) -> None:
        ...  # pragma: no cover - protocol

    async def list_by_session(self, session_id: str) -> list[AgentRun]:
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


@runtime_checkable
class OutboxRepository(Repository, Protocol):
    async def add(self, event: OutboxEvent) -> None:
        ...

    async def get_by_envelope(self, envelope_id: str) -> OutboxEvent | None:
        ...

    async def list_pending(self, limit: int = 100) -> list[OutboxEvent]:
        ...

    async def mark_published(self, event_id: str, published_at: int) -> None:
        ...


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
    session_envelopes: SessionEnvelopeRepository | None = None
    agent_runs: AgentRunRepository | None = None
    outbox: OutboxRepository | None = None

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
