"""Fake in-memory Unit of Work.

Provides a no-setup ``UnitOfWork`` whose repositories share a single
``MemoryStore``, so Application code paths can run and be tested without any
external service.
"""

from __future__ import annotations

from copy import deepcopy

from src.core.contracts.repositories import UnitOfWork
from src.plugins.persistence.fake.repositories import (
    FakeAgentRunRepository,
    FakeOutboxRepository,
    FakeAssetRepository,
    FakeConversationRepository,
    FakeEnvelopeRepository,
    FakeMessageRepository,
    FakeSessionRepository,
    FakeSessionEnvelopeRepository,
    MemoryStore,
)

__all__ = ["FakeUnitOfWork"]


class FakeUnitOfWork(UnitOfWork):
    """An in-memory Unit of Work backed by a shared ``MemoryStore``."""

    def __init__(self, store: MemoryStore | None = None) -> None:
        """Initialize the unit of work with an optional shared store.

        Args:
            store: Shared backing store; a fresh one is created when omitted.
        """
        super().__init__()
        self.store = store or MemoryStore()
        self._pending = None

    async def __aenter__(self) -> "FakeUnitOfWork":
        await self.store.transaction_lock.acquire()
        try:
            self._pending = MemoryStore()
            self._pending.__dict__.update(deepcopy({
                key: value for key, value in vars(self.store).items()
                if key != "transaction_lock"
            }))
            self.conversations = FakeConversationRepository(self._pending)
            self.envelopes = FakeEnvelopeRepository(self._pending)
            self.messages = FakeMessageRepository(self._pending)
            self.sessions = FakeSessionRepository(self._pending)
            self.session_envelopes = FakeSessionEnvelopeRepository(self._pending)
            self.assets = FakeAssetRepository(self._pending)
            self.agent_runs = FakeAgentRunRepository(self._pending)
            self.outbox = FakeOutboxRepository(self._pending)
        except BaseException:
            self.store.transaction_lock.release()
            raise
        return self

    async def __aexit__(self, *args: object) -> None:
        try:
            await super().__aexit__(*args)
        finally:
            self._pending = None
            self.store.transaction_lock.release()
            # Also drop bindings when commit or rollback raises.
            self.conversations = None
            self.envelopes = None
            self.messages = None
            self.sessions = None
            self.session_envelopes = None
            self.assets = None
            self.agent_runs = None
            self.outbox = None

    async def commit(self) -> None:
        """Publish an isolated snapshot while holding the store lock."""
        if self._pending is not None:
            self.store.__dict__.update(deepcopy({
                key: value for key, value in vars(self._pending).items()
                if key != "transaction_lock"
            }))

    async def rollback(self) -> None:
        """Discard staged writes; the shared store has not changed."""
        self._pending = None
