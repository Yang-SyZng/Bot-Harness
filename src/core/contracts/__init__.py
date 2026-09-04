"""Core Ports/Protocols.

These Protocols define the seams the Application layer depends on. Concrete
implementations (Platform renderer, OpenAI Agents backend, MySQL repository, Redis
runtime, Asyncio queue, ...) live in plugin / adapter / infrastructure layers
and are injected at composition time.
"""

from src.core.contracts.agent import (
    AgentBackend,
    AgentExecutionContext,
    AgentExecutionResult,
)
from src.core.contracts.repositories import (
    AgentRunRepository,
    AssetRepository,
    ConversationRepository,
    EnvelopeRepository,
    MessageRepository,
    Repository,
    SessionEnvelopeRepository,
    SessionRepository,
    UnitOfWork,
)

__all__ = [
    "AgentBackend",
    "AgentExecutionContext",
    "AgentExecutionResult",
    "ConversationRepository",
    "AgentRunRepository",
    "EnvelopeRepository",
    "MessageRepository",
    "Repository",
    "SessionEnvelopeRepository",
    "SessionRepository",
    "AssetRepository",
    "UnitOfWork",
]
