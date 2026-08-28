"""Re-export shim for the MySQL plugin models (backward compatibility).

The canonical SQLAlchemy models now live in the MySQL persistence plugin
(``src.plugins.persistence.mysql.models``). This module is kept so existing
imports such as ``from src.plugins.platforms.kook.persistence.models import Task`` keep
working during the migration. New code should import from the plugin package.
"""

from src.plugins.persistence.mysql.models import (  # noqa: F401
    Artifact,
    Conversation,
    Memory,
    Message,
    Task,
    TaskEvent,
    User,
)

__all__ = [
    "User",
    "Conversation",
    "Task",
    "Message",
    "TaskEvent",
    "Artifact",
    "Memory",
]
