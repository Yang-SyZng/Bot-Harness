"""Task queue port: a FIFO queue of task ids consumed by a worker."""

from __future__ import annotations

from typing import Protocol, runtime_checkable

__all__ = ["TaskQueue"]


@runtime_checkable
class TaskQueue(Protocol):
    """A FIFO queue of task ids to be executed by a worker.

    Concrete implementations: ``AsyncioTaskQueue``, ``RedisStreamTaskQueue``,
    ``FakeTaskQueue``. Application code never depends on the transport.
    """

    async def enqueue(self, task_id: str) -> None:
        """Push ``task_id`` onto the queue."""
        ...

    async def dequeue(self) -> str:
        """Pop and return the next task id (blocking until available)."""
        ...
