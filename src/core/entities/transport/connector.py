from __future__ import annotations

from dataclasses import dataclass, field

from src.core.values import BotPlatform

__all__ = ["Connector"]


@dataclass
class Connector:
    id: str | None = field(default=None)
    platform: BotPlatform | None = field(default=None)
    bot_actor_id: str | None = field(default=None)
    config_ref: str | None = field(default=None)
