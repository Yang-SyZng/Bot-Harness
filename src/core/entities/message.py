"""Message-related domain objects.

Holds the platform-agnostic ``IncomingMessage`` (the normalized input every
platform adapter produces), the ``ChatMessage`` used within an agent context,
and the domain ``Message`` persisted per task. None of these reference any
concrete platform.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Mapping

from src.core.entities.attachment import Attachment

__all__ = ["IncomingMessage", "ChatMessage", "Message", "MessageRole"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class IncomingMessage:
    """A normalized, platform-independent incoming message.

    This replaces the adapter-local ``IncomingMessage`` so Core owns the
    canonical shape. Only genuinely platform-neutral fields are named; any
    platform-specific addressing that a platform may or may not have (one
    platform's ``server_id``/``channel_id``, another's four or five keys, ...) is
    carried in the open-ended :attr:`dimensions` mapping, so Core never
    hard-codes a particular platform's shape.
    """

    message_id: str
    user_id: str
    text: str | None = None
    attachments: list[Attachment] = field(default_factory=list)
    received_at: datetime = field(default_factory=_now)

    # Optional platform-neutral metadata.
    platform: str | None = None
    reply_to_message_id: str | None = None

    # Platform-specific addressing dimensions (arbitrary keys/arity).
    dimensions: Mapping[str, str] = field(default_factory=dict)

    def get(self, key: str, default: str | None = None) -> str | None:
        """Read one platform addressing dimension.

        Example: ``incoming.get("channel_id", "")``.
        """
        return self.dimensions.get(key, default)


class MessageRole:
    """Literal roles for a persisted chat message."""

    USER = "user"
    ASSISTANT = "assistant"


@dataclass
class ChatMessage:
    """One turn in an agent conversation context."""

    role: str
    content: str
    message_id: str | None = None


@dataclass
class Message:
    """One message attached to a task (row-append-only conversation history)."""

    task_id: str
    role: MessageRole | str
    content: str
    attachments: list[Attachment] = field(default_factory=list)

    # Populated when the message has been persisted (DB surrogate key).
    id: int | None = field(default=None)

    @classmethod
    def from_incoming(
        cls,
        task_id: str,
        incoming: IncomingMessage,
    ) -> "Message":
        """Build a domain Message from a normalized incoming message."""
        return cls(
            task_id=task_id,
            role=MessageRole.USER,
            content=incoming.text or "",
            attachments=list(incoming.attachments),
        )
