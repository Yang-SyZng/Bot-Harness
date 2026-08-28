"""Platform-agnostic domain objects (Core entities).

Split by responsibility:

- ``transport`` subpackage: a message's provenance, addressing and travel
  (actors, connectors, transport refs, conversation addresses, envelopes,
  attachments).
- root modules: business/session entities (Conversation, Message) that build
  on the transport layer.
"""

from __future__ import annotations

from src.core.entities.conversation import Conversation
from src.core.entities.message import Message
from src.core.entities.transport.actor import ActorRef
from src.core.entities.transport.address import ConversationAddress
from src.core.entities.transport.attachments import Attachment
from src.core.entities.transport.connector import Connector
from src.core.entities.transport.envelope import MessageEnvelope
from src.core.entities.transport.transport import TransportRef

__all__ = [
    "Attachment",
    "Message",
    "Connector",
    "TransportRef",
    "ActorRef",
    "MessageEnvelope",
    "ConversationAddress",
    "Conversation",
]
