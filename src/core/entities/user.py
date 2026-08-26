"""A principal that interacts with the bot.

Completely platform-independent: only the stable external principal id and
optional display name are tracked here. The concrete provider is keyed by
``external_id`` plus a ``provider`` discriminator, so the same Core object can
serve users from any platform or future provider.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

__all__ = ["User"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class User:
    """A principal that can participate in conversations."""

    external_id: str
    provider: str
    display_name: str | None = None
    created_at: datetime = field(default_factory=_now)
    updated_at: datetime = field(default_factory=_now)

    # Populated when the user has been persisted (DB surrogate key).
    id: int | None = field(default=None)
