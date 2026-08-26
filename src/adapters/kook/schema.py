"""Re-export shim for KOOK adapter schema types.

The canonical definitions now live in Core (``src.core.entities``). This module
is kept so existing imports such as
``from src.adapters.kook.schema import Attachment, IncomingMessage`` keep
working during the migration. New code should import from ``src.core``.
"""

from src.core.contracts.agent import AgentRequest, AgentResult
from src.core.entities.artifact import Artifact
from src.core.entities.attachment import Attachment
from src.core.entities.message import IncomingMessage

__all__ = [
    "AgentRequest",
    "AgentResult",
    "Artifact",
    "Attachment",
    "IncomingMessage",
]
