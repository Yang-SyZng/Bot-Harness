"""AgentRun entity: one concrete execution attempt for a Session."""

from __future__ import annotations

from dataclasses import dataclass, field

from src.core.values import AgentRunStatus, new_id

__all__ = ["AgentRun"]


@dataclass
class AgentRun:
    """An independently claimable and retryable execution of a Session."""

    id: str = field(default_factory=new_id)
    session_id: str | None = field(default=None)
    attempt: int = 1
    status: AgentRunStatus = AgentRunStatus.QUEUED
    backend: str | None = field(default=None)
    model: str | None = field(default=None)
    worker_id: str | None = field(default=None)
    started_at: int | None = field(default=None)
    completed_at: int | None = field(default=None)
