"""Fake in-memory repositories.

Each repository keeps its records in a mutable in-memory store. One shared store
object can be handed to several repositories so a ``FakeUnitOfWork`` transaction
sees consistent data across conversations / envelopes / sessions / assets.

Entity ``id`` values are stable UUIDs generated at creation time (via
``new_id``), so repositories simply store the entities as given.
"""

from __future__ import annotations

import asyncio
from dataclasses import replace

from src.core.entities.agent_run import AgentRun
from src.core.entities.outbox_event import OutboxEvent
from src.core.entities.conversation import Conversation
from src.core.entities.message import Message
from src.core.entities.session import Session
from src.core.entities.session_envelope import SessionEnvelope
from src.core.entities.transport.address import ConversationAddress
from src.core.entities.transport.asset import Asset
from src.core.entities.transport.envelope import MessageEnvelope
from src.core.values import SessionEnvelopeRole, SessionStatus, now_ms

__all__ = [
    "FakeOutboxRepository",
    "MemoryStore",
    "FakeConversationRepository",
    "FakeEnvelopeRepository",
    "FakeMessageRepository",
    "FakeSessionRepository",
    "FakeSessionEnvelopeRepository",
    "FakeAssetRepository",
    "FakeAgentRunRepository",
]


class MemoryStore:
    """Shared in-memory backing store used by all fake repositories."""

    def __init__(self) -> None:
        self.transaction_lock = asyncio.Lock()
        self.conversations: dict[str, Conversation] = {}
        self.envelopes: dict[str, MessageEnvelope] = {}
        self.messages: dict[str, Message] = {}
        self.sessions: dict[str, Session] = {}
        self.session_envelopes: dict[tuple[str, str], SessionEnvelope] = {}
        self.assets: list[Asset] = []
        self.agent_runs: dict[str, AgentRun] = {}
        self.outbox: dict[str, OutboxEvent] = {}


class FakeConversationRepository:
    """``ConversationRepository`` stored in memory, keyed by address."""

    def __init__(self, store: MemoryStore) -> None:
        self._store = store

    @staticmethod
    def _key(address: ConversationAddress) -> str:
        return address.identity_key()

    async def add(self, conversation: Conversation) -> None:
        if conversation.address is not None:
            self._store.conversations[self._key(conversation.address)] = conversation

    async def get(self, conversation_id: str) -> Conversation | None:
        for c in self._store.conversations.values():
            if str(c.id) == conversation_id:
                return c
        return None

    async def get_or_create_by_address(
        self, address: ConversationAddress
    ) -> Conversation:
        key = self._key(address)
        existing = self._store.conversations.get(key)
        if existing is not None:
            return existing
        conversation = Conversation(address=address)
        self._store.conversations[key] = conversation
        return conversation

    async def save(self, conversation: Conversation) -> None:
        if conversation.address is not None:
            self._store.conversations[self._key(conversation.address)] = conversation


class FakeEnvelopeRepository:
    """``EnvelopeRepository`` stored in memory, keyed by envelope id."""

    def __init__(self, store: MemoryStore) -> None:
        self._store = store

    async def add(self, envelope: MessageEnvelope) -> None:
        if envelope.conversation_id is None:
            raise ValueError("envelope conversation_id is required")
        if envelope.message is not None:
            self._store.messages[envelope.message.id] = envelope.message
        self._store.envelopes[envelope.id] = envelope

    async def get(self, envelope_id: str) -> MessageEnvelope | None:
        return self._store.envelopes.get(envelope_id)

    async def get_by_idempotency_key(
        self, conversation_id: str, idempotency_key: str
    ) -> MessageEnvelope | None:
        return next((e for e in self._store.envelopes.values()
                     if e.conversation_id == conversation_id
                     and e.idempotency_key == idempotency_key), None)

    async def get_by_external_message_id(
        self,
        *,
        conversation_id: str,
        external_message_id: str,
    ) -> MessageEnvelope | None:
        for envelope in self._store.envelopes.values():
            if envelope.conversation_id != conversation_id:
                continue
            if (
                envelope.transport is not None
                and envelope.transport.external_message_id == external_message_id
            ):
                return envelope
        return None

    async def list_by_conversation(
        self,
        conversation_id: str,
        *,
        after_envelope_id: str | None = None,
        limit: int | None = None,
    ) -> list[MessageEnvelope]:
        items = [
            e for e in self._store.envelopes.values()
            if e.conversation_id == conversation_id
        ]
        items.sort(key=lambda e: str(e.id or ""))
        if after_envelope_id is not None:
            seen = False
            filtered: list[MessageEnvelope] = []
            for e in items:
                if seen:
                    filtered.append(e)
                elif str(e.id) == after_envelope_id:
                    seen = True
            items = filtered
        if limit is not None:
            items = items[-limit:]
        return items


class FakeOutboxRepository:
    def __init__(self, store: MemoryStore) -> None:
        self._store = store

    async def add(self, event: OutboxEvent) -> None:
        if event.run_id not in self._store.agent_runs:
            raise ValueError("outbox run does not exist")
        if event.envelope_id not in self._store.envelopes:
            raise ValueError("outbox envelope does not exist")
        if any(e.run_id == event.run_id or e.envelope_id == event.envelope_id
               for e in self._store.outbox.values()):
            raise ValueError("duplicate execution event")
        self._store.outbox[event.id] = event

    async def get_by_envelope(self, envelope_id: str) -> OutboxEvent | None:
        return next((e for e in self._store.outbox.values()
                     if e.envelope_id == envelope_id), None)

    async def list_pending(self, limit: int = 100) -> list[OutboxEvent]:
        if limit < 1:
            raise ValueError("limit must be positive")
        return sorted((e for e in self._store.outbox.values()
                       if e.published_at is None),
                      key=lambda e: (e.created_at, e.id))[:limit]

    async def mark_published(self, event_id: str, published_at: int) -> None:
        event = self._store.outbox[event_id]
        if event.published_at is None:
            self._store.outbox[event_id] = replace(event, published_at=published_at)


class FakeMessageRepository:
    """``MessageRepository`` stored in memory, keyed by message id."""

    def __init__(self, store: MemoryStore) -> None:
        self._store = store

    async def add(self, message: Message) -> None:
        self._store.messages[message.id] = message

    async def get(self, message_id: str) -> Message | None:
        return self._store.messages.get(message_id)


class FakeSessionRepository:
    """``SessionRepository`` stored in memory, keyed by session id."""

    def __init__(self, store: MemoryStore) -> None:
        self._store = store

    async def add(self, session: Session) -> None:
        self._store.sessions[session.id] = session

    async def get(self, session_id: str) -> Session | None:
        return self._store.sessions.get(session_id)

    async def save(self, session: Session) -> None:
        if session.id is not None:
            self._store.sessions[session.id] = session

    async def get_active(
        self,
        *,
        conversation_id: str,
        owner_user_id: str | None = None,
    ) -> Session | None:
        for s in self._store.sessions.values():
            if s.conversation_id != conversation_id:
                continue
            if owner_user_id is not None and s.owner_user_id != owner_user_id:
                continue
            if s.status in (
                SessionStatus.QUEUED,
                SessionStatus.RUNNING,
                SessionStatus.WAITING_USER,
            ):
                return s
        return None

    async def list_by_conversation(self, conversation_id: str) -> list[Session]:
        return [s for s in self._store.sessions.values() if s.conversation_id == conversation_id]


class FakeAssetRepository:
    """``AssetRepository`` stored in memory."""

    def __init__(self, store: MemoryStore) -> None:
        self._store = store

    async def add(self, asset: Asset) -> None:
        self._store.assets.append(asset)

    async def get(self, asset_id: str) -> Asset | None:
        for a in self._store.assets:
            if str(a.id) == asset_id:
                return a
        return None

    async def list_by_sha256(self, sha256: str) -> list[Asset]:
        return [a for a in self._store.assets if a.sha256 == sha256]


class FakeSessionEnvelopeRepository:
    """Ordered, deduplicated Session-to-Envelope relations in memory."""

    def __init__(self, store: MemoryStore) -> None:
        self._store = store

    async def attach(
        self,
        *,
        session_id: str,
        envelope_id: str,
        relation_role: SessionEnvelopeRole = SessionEnvelopeRole.INPUT,
    ) -> SessionEnvelope:
        key = (session_id, envelope_id)
        existing = self._store.session_envelopes.get(key)
        if existing is not None:
            return existing

        session = self._store.sessions.get(session_id)
        envelope = self._store.envelopes.get(envelope_id)
        if session is None:
            raise ValueError(f"unknown session: {session_id}")
        if envelope is None:
            raise ValueError(f"unknown envelope: {envelope_id}")
        if session.conversation_id != envelope.conversation_id:
            raise ValueError("session and envelope belong to different conversations")

        sequence_no = 1 + max(
            (
                link.sequence_no
                for link in self._store.session_envelopes.values()
                if link.session_id == session_id
            ),
            default=0,
        )
        link = SessionEnvelope(
            session_id=session_id,
            envelope_id=envelope_id,
            sequence_no=sequence_no,
            relation_role=relation_role,
            created_at=now_ms(),
        )
        self._store.session_envelopes[key] = link
        return link

    async def list_by_session(self, session_id: str) -> list[SessionEnvelope]:
        links = [
            link
            for link in self._store.session_envelopes.values()
            if link.session_id == session_id
        ]
        return sorted(links, key=lambda link: link.sequence_no)

    async def list_session_ids(self, envelope_id: str) -> list[str]:
        links = [
            link
            for link in self._store.session_envelopes.values()
            if link.envelope_id == envelope_id
        ]
        links.sort(key=lambda link: (link.created_at or 0, link.session_id))
        return [link.session_id for link in links]


class FakeAgentRunRepository:
    """``AgentRunRepository`` stored in memory."""

    def __init__(self, store: MemoryStore) -> None:
        self._store = store

    async def add(self, run: AgentRun) -> None:
        if run.session_id is None or run.session_id not in self._store.sessions:
            raise ValueError(f"unknown session: {run.session_id}")
        self._store.agent_runs[run.id] = run

    async def get(self, run_id: str) -> AgentRun | None:
        return self._store.agent_runs.get(run_id)

    async def save(self, run: AgentRun) -> None:
        self._store.agent_runs[run.id] = run

    async def list_by_session(self, session_id: str) -> list[AgentRun]:
        runs = [
            run for run in self._store.agent_runs.values()
            if run.session_id == session_id
        ]
        return sorted(runs, key=lambda run: (run.attempt, run.id))
