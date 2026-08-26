"""Re-export shim for the migrated agent schema models.

The canonical definitions now live in Core (``src.core.contracts.agent`` and
``src.core.entities.artifact``). This module is kept so existing imports such as
``from src.agent.schema import AgentRequest, AgentResult, Artifact`` keep
working during the migration. New code should import from ``src.core`` directly.
"""

from src.core.contracts.agent import AgentRequest, AgentResult
from src.core.entities.artifact import Artifact

__all__ = ["AgentRequest", "Artifact", "AgentResult"]
