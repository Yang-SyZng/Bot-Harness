"""Fake in-memory repositories.

Each repository keeps its records in a mutable in-memory store. One shared store
object can be handed to several repositories so a ``FakeUnitOfWork`` transaction
sees consistent data across conversations / envelopes / sessions / assets.

Entity ``id`` values are stable UUIDs generated at creation time (via
``new_id``), so repositories simply store the entities as given.
"""

from __future__ import annotations

from src.core.entities.conversation import Conversation
from src.core.entities.message import Message
from src.core.entities.session import Session
from src.core.entities.transport.address import ConversationAddress
from src.core.entities.transport.asset import Asset
from src.core.entities.transport.envelope import MessageEnvelope
from src.core.values import TaskStatus

__all__ = [
    "MemoryStore",
    "FakeConversationRepository",
    "FakeEnvelopeRepository",
    "FakeMessageRepository",
    "FakeSessionRepository",
    "FakeAssetRepository",
]


class MemoryStore:
    """Shared in-memory backing store used by all fake repositories."""

    def __init__(self) -> None:
        self.conversations: dict[str, Conversation] = {}
        self.envelopes: dict[str, MessageEnvelope] = {}
        self.messages: list[Message] = []
        self.sessions: dict[str, Session] = {}
        self.assets: list[Asset] = []


class FakeConversationRepository:
    """``ConversationRepository`` stored in memory, keyed by address."""

    def __init__(self, store: MemoryStore) -> None:
        self._store = store

    @staticmethod
    def _key(address: ConversationAddress) -> str:
        return ",".join(
            f"{k}={v}"
            for k, v in address.__dict__.items()
            if v is not None
        )

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
        self._store.envelopes[envelope.id] = envelope

    async def get(self, envelope_id: str) -> MessageEnvelope | None:
        return self._store.envelopes.get(envelope_id)

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


class FakeMessageRepository:
    """``MessageRepository`` stored in memory (messages read out of envelopes)."""

    def __init__(self, store: MemoryStore) -> None:
        self._store = store

    async def get(self, message_id: str) -> Message | None:
        for e in self._store.envelopes.values():
            for m in e.messages or []:
                if str(m.id) == message_id:
                    return m
        return None

    async def list_for_envelopes(
        self,
        envelope_ids: list[str],
        *,
        limit: int | None = None,
    ) -> list[Message]:
        out: list[Message] = []
        for eid in envelope_ids:
            envelope = self._store.envelopes.get(eid)
            if envelope is not None and envelope.messages:
                out.extend(envelope.messages)
        if limit is not None:
            out = out[-limit:]
        return out


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
        user_id: str | None = None,
    ) -> Session | None:
        for s in self._store.sessions.values():
            if s.conversation_id != conversation_id:
                continue
            if user_id is not None and s.user_id != user_id:
                continue
            if s.status in (TaskStatus.QUEUED, TaskStatus.RUNNING, TaskStatus.WAITING_USER):
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
