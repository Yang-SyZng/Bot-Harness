from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

from src.core.entities.transport.attachments import Attachment

__all__ = ["Message"]


@dataclass
class Message:
    id: str | None = field(default=None)
    content: str | None = field(default=None)
    attachments: List[Attachment] | None = field(default_factory=list)
    reply_to_id: str | None = field(default=None)
    sent_at: int | None = field(default=None)
