"""MySQL persistence plugin entry point.

Exposes the ``metadata`` (Alembic autogenerate target) and the ORM models owned
by this plugin. Importing this package registers every model on the framework
``Base``.
"""

from __future__ import annotations

from sqlalchemy import MetaData

from src.plugins.persistence.mysql import models
from src.plugins.persistence.mysql.database.base import Base

# Alembic autogenerate target: the schema metadata of the MySQL plugin models.
metadata: MetaData = Base.metadata

__all__ = [
    "metadata",
    "models",
    "User",
    "Conversation",
    "Task",
    "Message",
    "TaskEvent",
    "Artifact",
    "Memory",
]

# Explicit re-exports for ergonomic imports.
from src.plugins.persistence.mysql.models import (  # noqa: E402,F401
    Artifact,
    Conversation,
    Memory,
    Message,
    Task,
    TaskEvent,
    User,
)
