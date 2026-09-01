"""Session routing decision.

``SessionRouter`` decides, from the conversation/scoping context and the
currently active session (if any), whether a new message should be appended to
an existing session or start a new one. It follows the same pure-decision
pattern as ``TaskRouter``: it only produces a routing plan; persistence of the
session is deferred to the persistence layer.
"""

from __future__ import annotations

from dataclasses import dataclass

from src.core.entities import Session
from src.core.values import TaskStatus, now_ms

__all__ = ["SessionRoute", "SessionRouter"]


@dataclass(frozen=True)
class SessionRoute:
    """A routing decision for one incoming piece of traffic."""

    action: str  # "append" | "create"
    session_id: str | None = None


class SessionRouter:
    """Decide whether an incoming message joins an existing session or is new."""

    def route(
        self,
        *,
        conversation_id: str,
        user_id: str,
        active_session: Session | None = None,
    ) -> SessionRoute:
        """Return the routing decision for the given scoping context.

        If an active (in-flight) session exists for the conversation, the
        message is appended to it; otherwise a new session must be created.
        """
        if active_session is not None and active_session.is_active():
            return SessionRoute(action="append", session_id=active_session.id)
        return SessionRoute(action="create")

    def new_session(
        self,
        *,
        conversation_id: str,
        user_id: str,
        goal: str | None = None,
    ) -> Session:
        """Create a new in-memory session for the given scoping context."""
        ts = now_ms()
        return Session(
            conversation_id=conversation_id,
            user_id=user_id,
            status=TaskStatus.QUEUED,
            goal=goal,
            envelope_ids=[],
            task_ids=[],
            created_at=ts,
            updated_at=ts,
        )
