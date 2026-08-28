from __future__ import annotations

from dataclasses import dataclass, field

from src.core.values import BotPlatform

__all__ = ["ConversationAddress"]


@dataclass
class ConversationAddress:
    platform: BotPlatform | None = field(default=None)
    space_id: str | None = field(default=None)
    room_id: str | None = field(default=None)
    topic_id: str | None = field(default=None)
    external_id: str | None = field(default=None)
