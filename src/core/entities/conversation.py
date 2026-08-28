from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

from src.core.entities.transport.address import ConversationAddress
from src.core.entities.transport.envelope import MessageEnvelope
from src.core.values import ConversationType

__all__ = ["Conversation"]


@dataclass
class Conversation:
    id: str | None = field(default=None)
    conversation_type: ConversationType | None = field(default=None)
    address: ConversationAddress | None = field(default=None)
    parent_id: str | None = field(default=None)
    messages: List[MessageEnvelope] | None = field(default=None)
    created_at: int | None = field(default=None)
    last_message_at: int | None = field(default=None)
