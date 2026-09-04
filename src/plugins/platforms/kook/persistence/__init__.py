"""KOOK adapter persistence: alembic hooks and model re-exports.

Historically this package held the ORM models; they now live in the MySQL
persistence plugin (``src.plugins.persistence.mysql``) whose ``metadata`` is the
Alembic autogenerate target. Importing this shim registers every model on the
plugin's ``Base`` and keeps old imports working during the migration.
"""

from __future__ import annotations

from src.plugins.platforms.kook.persistence import models  # noqa: F401
from src.plugins.persistence.mysql import metadata  # noqa: F401

__all__ = [
    "metadata",
    "models",
    "Conversation",
    "Message",
    "MessageEnvelope",
    "Session",
    "SessionEnvelope",
    "Asset",
    "AgentRun",
]

# Explicit re-exports for ergonomic imports.
from src.plugins.platforms.kook.persistence.models import (  # noqa: E402,F401
    AgentRun,
    Asset,
    Conversation,
    Message,
    MessageEnvelope,
    Session,
    SessionEnvelope,
)
