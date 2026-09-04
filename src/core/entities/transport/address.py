from __future__ import annotations

import hashlib
import json
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

    def as_mapping(self) -> dict[str, str | None]:
        """Return a JSON-ready representation with a stable field set."""
        return {
            "platform": self.platform.value if self.platform is not None else None,
            "space_id": self.space_id,
            "room_id": self.room_id,
            "topic_id": self.topic_id,
            "external_id": self.external_id,
        }

    def identity_key(self) -> str:
        """Return a fixed-length identity key suitable for a unique index."""
        canonical = json.dumps(
            self.as_mapping(),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
