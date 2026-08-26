"""Task domain object.

A task is a unit of work within a conversation, tied to an agent session and a
task-specific workspace.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from src.core.values import TaskStatus

__all__ = ["Task"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class Task:
    """A unit of work within a conversation."""

    conversation_id: int
    status: TaskStatus = TaskStatus.QUEUED
    title: str | None = None
    agent_session_id: str | None = None
    previous_response_id: str | None = None
    workspace_path: Path | None = None
    created_at: datetime = field(default_factory=_now)
    updated_at: datetime = field(default_factory=_now)
    completed_at: datetime | None = None

    # Populated when the task has been persisted (DB surrogate key).
    id: int | None = field(default=None)

    @property
    def task_id(self) -> str:
        """Stable public task identifier (surrogate key once persisted)."""
        if self.id is not None:
            return str(self.id)
        raise ValueError("The task has not been persisted yet and has no id.")
