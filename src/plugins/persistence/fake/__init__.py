"""Fake in-memory persistence plugin.

Implements the Core repository protocols with plain in-memory storage so the
Application Use Cases can be exercised end-to-end without MySQL (or any
external service). Multiple fake repositories can share one backing store.
"""

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
from src.plugins.persistence.fake.unit_of_work import FakeUnitOfWork

__all__ = [
    "MemoryStore",
    "FakeConversationRepository",
    "FakeEnvelopeRepository",
    "FakeMessageRepository",
    "FakeSessionRepository",
    "FakeSessionEnvelopeRepository",
    "FakeAssetRepository",
    "FakeAgentRunRepository",
    "FakeUnitOfWork",
]
