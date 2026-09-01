from __future__ import annotations

from dataclasses import dataclass, field

from src.core.values import BotPlatform, new_id

__all__ = ["Connector"]


@dataclass
class Connector:
    id: str = field(default_factory=new_id)
    platform: BotPlatform | None = field(default=None)
    bot_actor_id: str | None = field(default=None)
    config_ref: str | None = field(default=None)
