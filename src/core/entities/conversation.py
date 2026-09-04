from __future__ import annotations

from dataclasses import dataclass, field

from src.core.entities.transport.address import ConversationAddress
from src.core.values import ConversationType, new_id

__all__ = ["Conversation"]


@dataclass
class Conversation:
    id: str = field(default_factory=new_id)
    conversation_type: ConversationType | None = field(default=None)
    address: ConversationAddress | None = field(default=None)
    parent_id: str | None = field(default=None)
    created_at: int | None = field(default=None)
    last_message_at: int | None = field(default=None)
