"""Session entity: a task session that isolates and strings together messages.

A session classifies and isolates a subset of the conversation's ``MessageEnvelope``
records for one task, by reference (no message snapshot). It tracks the task's
goal and state, and the consumed cursor for recovery. Child tasks are modeled
as child sessions through ``parent_session_id``.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from src.core.values import SessionStatus, new_id

__all__ = ["Session"]

_ACTIVE_STATES = (
    SessionStatus.QUEUED,
    SessionStatus.RUNNING,
    SessionStatus.WAITING_USER,
)


@dataclass
class Session:
    """A task session within a conversation.

    Envelope membership is maintained by ``SessionEnvelopeRepository`` rather
    than embedded here. ``covers_through_envelope_id`` is the consumed cursor
    used to resume after a restart.
    """

    # ── identity / ownership (isolation against cross-wiring) ──
    id: str = field(default_factory=new_id)
    conversation_id: str | None = field(default=None)
    owner_user_id: str | None = field(default=None)
    parent_session_id: str | None = field(default=None)

    # ── recovery cursor (membership lives in SessionEnvelopeRepository) ──
    covers_through_envelope_id: str | None = field(default=None)

    # ── logical task/session state ──
    goal: str | None = field(default=None)
    status: SessionStatus | None = field(default=None)
    summary: str | None = field(default=None)

    # ── idempotency / concurrency (reserved) ──
    idempotency_key: str | None = field(default=None)
    version: int | None = field(default=None)

    # ── time (unified ms UTC timestamp) ──
    created_at: int | None = field(default=None)
    updated_at: int | None = field(default=None)

    def advance_through(self, envelope_id: str) -> None:
        """Advance the consumed cursor past ``envelope_id``."""
        self.covers_through_envelope_id = envelope_id

    def is_active(self) -> bool:
        """True while the session is in-flight and can accept new messages."""
        return self.status in _ACTIVE_STATES

    def can_resume(self) -> bool:
        """True when the session is paused and can resume from its cursor."""
        return self.status == SessionStatus.PAUSED
