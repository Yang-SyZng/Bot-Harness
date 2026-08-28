from __future__ import annotations

from dataclasses import dataclass, field

from src.core.values import ActorRefType

__all__ = ["ActorRef"]


@dataclass
class ActorRef:
    id: str | None = field(default=None)
    actor_type: ActorRefType | None = field(default=None)
    external_id: str | None = field(default=None)
    display_name: str | None = field(default=None)
