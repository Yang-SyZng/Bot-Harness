"""Conversation domain object.

A conversation groups the exchange between a user and the bot inside a
context as a stable, platform-independent conversation thread, tracking the
currently active task.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Mapping

__all__ = ["Conversation", "ConversationIdentity"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class ConversationIdentity:
    """Platform-neutral identity used to look up or create a conversation.

    Deliberately **not** bound to any specific platform's fields. A platform
    scopes a conversation by whatever dimensions it actually has — one platform
    may use ``{server, channel, user}``, another may use one, four, or five
    different keys. Each platform maps its own dimensions into this generic
    key/value set via :meth:`from_mapping`, so Core never hard-codes a
    particular platform's identity shape.

    The identity is stored as an immutable, order-independent set of
    ``(key, value)`` pairs, so two identities with the same dimensions in any
    order compare and hash equal.
    """

    _items: frozenset[tuple[str, str]]

    @classmethod
    def from_mapping(cls, dimensions: Mapping[str, str]) -> "ConversationIdentity":
        """Build an identity from an arbitrary platform dimension mapping."""
        items = frozenset((str(key), str(value)) for key, value in dimensions.items())
        return cls(items or frozenset())

    def get(self, key: str, default: str | None = None) -> str | None:
        """Read one dimension value by key.

        Example: ``identity.get("user_id")``.
        """
        return dict(self._items).get(key, default)

    def as_mapping(self) -> Mapping[str, str]:
        """Return the dimensions as a plain ``dict`` view."""
        return dict(self._items)

    def __len__(self) -> int:
        return len(self._items)

    def __contains__(self, item: object) -> bool:
        return item in self._items

    def __str__(self) -> str:
        """A stable, deterministic, JSON-friendly identity string.

        Keys/values are sorted so the string is independent of insertion order
        and therefore usable as a cache/DB key across platforms.
        """
        return "&".join(f"{key}={value}" for key, value in sorted(self._items))


@dataclass
class Conversation:
    """A long-lived, per-context chat with the bot."""

    identity: ConversationIdentity
    active_task_id: str | None = None
    created_at: datetime = field(default_factory=_now)
    updated_at: datetime = field(default_factory=_now)

    # Populated when the conversation has been persisted (DB surrogate key).
    id: int | None = field(default=None)
