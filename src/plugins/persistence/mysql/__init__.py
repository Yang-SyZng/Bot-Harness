"""MySQL persistence plugin entry point.

Exposes the ``metadata`` (Alembic autogenerate target) and the ORM models owned
by this plugin. Importing this package registers every model on the framework
``Base``.
"""

from __future__ import annotations

from sqlalchemy import MetaData

from src.plugins.persistence.mysql import models
from src.plugins.persistence.mysql.database.base import Base
from src.plugins.persistence.mysql.unit_of_work import MySQLUnitOfWork

# Alembic autogenerate target: the schema metadata of the MySQL plugin models.
metadata: MetaData = Base.metadata

__all__ = [
    "OutboxEvent",
    "metadata",
    "models",
    "Conversation",
    "Message",
    "MessageEnvelope",
    "Session",
    "SessionEnvelope",
    "Asset",
    "AgentRun",
    "MySQLUnitOfWork",
]

# Explicit re-exports for ergonomic imports.
from src.plugins.persistence.mysql.models import (  # noqa: E402,F401
    OutboxEvent,
    AgentRun,
    Asset,
    Conversation,
    Message,
    MessageEnvelope,
    Session,
    SessionEnvelope,
)
