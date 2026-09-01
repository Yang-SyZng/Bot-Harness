"""Session entity: a task session that isolates and strings together messages.

A session classifies and isolates a subset of the conversation's ``MessageEnvelope``
records for one task, by reference (no message snapshot). It tracks the task's
goal and state, the consumed cursor for recovery, and the sub-tasks it was
split into. Session state reuses :class:`~src.core.values.TaskStatus`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

from src.core.values import TaskStatus, new_id

__all__ = ["Session"]

_ACTIVE_STATES = (
    TaskStatus.QUEUED,
    TaskStatus.RUNNING,
    TaskStatus.WAITING_USER,
)


@dataclass
class Session:
    """A task session within a conversation.

    ``envelope_ids`` references the envelopes of this task in order; the session
    never copies message content. ``covers_through_message_id`` is the consumed
    cursor used to resume after a restart. ``task_ids`` points at the sub-tasks
    this session was split into.
    """

    # ── identity / ownership (isolation against cross-wiring) ──
    id: str = field(default_factory=new_id)
    conversation_id: str | None = field(default=None)
    user_id: str | None = field(default=None)
    parent_session_id: str | None = field(default=None)

    # ── references (string envelopes by task; no snapshot) ──
    envelope_ids: List[str] | None = field(default_factory=list)
    covers_through_message_id: str | None = field(default=None)

    # ── task decomposition (a session may be split into sub-tasks) ──
    task_ids: List[str] | None = field(default_factory=list)

    # ── task / execution state (reuses TaskStatus) ──
    goal: str | None = field(default=None)
    status: TaskStatus | None = field(default=None)
    summary: str | None = field(default=None)

    # ── idempotency / concurrency (reserved) ──
    idempotency_key: str | None = field(default=None)
    version: int | None = field(default=None)

    # ── time (unified ms UTC timestamp) ──
    created_at: int | None = field(default=None)
    updated_at: int | None = field(default=None)

    def add_envelope(self, envelope_id: str) -> None:
        """Append ``envelope_id`` to this session's message list (deduplicated)."""
        if self.envelope_ids is None:
            self.envelope_ids = []
        if envelope_id not in self.envelope_ids:
            self.envelope_ids.append(envelope_id)

    def advance_through(self, envelope_id: str) -> None:
        """Advance the consumed cursor past ``envelope_id``."""
        self.covers_through_message_id = envelope_id

    def is_active(self) -> bool:
        """True while the session is in-flight and can accept new messages."""
        return self.status in _ACTIVE_STATES

    def can_resume(self) -> bool:
        """True when the session is paused and can resume from its cursor."""
        return self.status == TaskStatus.PAUSED
