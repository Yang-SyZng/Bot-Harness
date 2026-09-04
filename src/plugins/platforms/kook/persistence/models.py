"""Re-export shim for the MySQL plugin models (backward compatibility).

The canonical SQLAlchemy models now live in the MySQL persistence plugin
(``src.plugins.persistence.mysql.models``). This module remains only as a thin
compatibility import path. New code should import from the MySQL plugin.
"""

from src.plugins.persistence.mysql.models import (  # noqa: F401
    AgentRun,
    Asset,
    Conversation,
    Message,
    MessageEnvelope,
    Session,
    SessionEnvelope,
)

__all__ = [
    "Conversation",
    "Message",
    "MessageEnvelope",
    "Session",
    "SessionEnvelope",
    "Asset",
    "AgentRun",
]
