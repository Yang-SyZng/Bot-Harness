"""Fake in-memory Unit of Work.

Provides a no-setup ``UnitOfWork`` whose repositories share a single
``MemoryStore``, so Application code paths can run and be tested without any
external service.
"""

from __future__ import annotations

from src.core.contracts.repositories import UnitOfWork
from src.plugins.persistence.fake.repositories import (
    FakeAgentRunRepository,
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

    async def __aenter__(self) -> "FakeUnitOfWork":
        self.conversations = FakeConversationRepository(self.store)
        self.envelopes = FakeEnvelopeRepository(self.store)
        self.messages = FakeMessageRepository(self.store)
        self.sessions = FakeSessionRepository(self.store)
        self.session_envelopes = FakeSessionEnvelopeRepository(self.store)
        self.assets = FakeAssetRepository(self.store)
        self.agent_runs = FakeAgentRunRepository(self.store)
        return self

    async def __aexit__(self, *args: object) -> None:
        await super().__aexit__(*args)
        # Drop bindings so state is not reused across transactions.
        self.conversations = None
        self.envelopes = None
        self.messages = None
        self.sessions = None
        self.session_envelopes = None
        self.assets = None
        self.agent_runs = None

    async def commit(self) -> None:
        """For in-memory storage writes are immediately visible; commit is a
        boundary marker and therefore a no-op."""

    async def rollback(self) -> None:
        """In-memory writes are not staged, so rollback is a no-op. This
        satisfies the UnitOfWork seam while keeping the fake simple."""
