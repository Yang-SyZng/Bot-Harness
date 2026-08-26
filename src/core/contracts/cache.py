"""Cache / runtime ports: hot cache, dedup, locks and rate limiting."""

from __future__ import annotations

from typing import Protocol, runtime_checkable

__all__ = ["MessageDedup", "TransactionalTaskLock"]


@runtime_checkable
class MessageDedup(Protocol):
    """Idempotency claim mechanism for incoming message ids.

    Implemented today as a filesystem-backed deduplicator; may later be a Redis
    SETNX or a DB unique constraint. Application code only depends on this port.
    """

    def claim(self, message_id: str) -> bool:
        """Atomically claim ``message_id``; ``False`` if already claimed."""
        ...

    def mark(self, message_id: str, status: str) -> None:
        """Record the final status (e.g. ``completed`` / ``failed``)."""
        ...


@runtime_checkable
class TransactionalTaskLock(Protocol):
    """Cross-process lock for task state transitions."""

    async def acquire(self, task_id: str, timeout: float = 30.0) -> None:
        ...  # pragma: no cover - protocol

    async def release(self, task_id: str) -> None:
        ...  # pragma: no cover - protocol
