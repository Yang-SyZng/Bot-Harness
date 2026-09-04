from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

from src.core.entities.message import Message
from src.core.entities.transport.actor import ActorRef
from src.core.entities.transport.transport import TransportRef
from src.core.values import (
    MessageEnvelopeDirectionType,
    MessageEnvelopeTransportFlowType,
    new_id,
)

__all__ = ["MessageEnvelope"]


@dataclass
class MessageEnvelope:
    version: str = "v0.1"

    id: str = field(default_factory=new_id)
    conversation_id: str | None = field(default=None)
    message: Message | None = field(default=None)
    sender: ActorRef | None = field(default=None)
    recipient: ActorRef | None = field(default=None)
    reply_to_envelope_id: str | None = field(default=None)

    transport: TransportRef | None = field(default=None)
    direction: MessageEnvelopeDirectionType | None = field(default=None)
    transport_flow: MessageEnvelopeTransportFlowType | None = field(default=None)

    occurred_at: int | None = field(default=None)
    received_at: int | None = field(default=None)
    idempotency_key: str | None = field(default=None)
