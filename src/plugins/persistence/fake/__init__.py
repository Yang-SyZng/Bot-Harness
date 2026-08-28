"""Fake in-memory persistence plugin.

Implements the Core repository protocols with plain in-memory storage so the
Application Use Cases can be exercised end-to-end without MySQL (or any
external service). Multiple fake repositories can share one backing store.
"""

from src.plugins.persistence.fake.repositories import (
    FakeConversationRepository,
    FakeMessageRepository,
    FakeTaskRepository,
    FakeUserRepository,
    MemoryStore,
)
from src.plugins.persistence.fake.unit_of_work import FakeUnitOfWork

__all__ = [
    "MemoryStore",
    "FakeUserRepository",
    "FakeConversationRepository",
    "FakeTaskRepository",
    "FakeMessageRepository",
    "FakeUnitOfWork",
]
