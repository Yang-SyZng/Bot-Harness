"""Platform-neutral values at the bidirectional message boundary."""

from dataclasses import dataclass

from src.core.entities.message import Message
from src.core.entities.transport.address import ConversationAddress
from src.core.entities.transport.envelope import MessageEnvelope


@dataclass(frozen=True)
class NormalizedIncoming:
    envelope: MessageEnvelope
    address: ConversationAddress


@dataclass(frozen=True)
class OutgoingMessage:
    delivery_id: str
    message: Message
    address: ConversationAddress
    external_reply_to_message_id: str | None = None


@dataclass(frozen=True)
class DeliveryReceipt:
    delivery_id: str
    external_message_id: str
    sent_at: int | None = None
