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
from src.core.contracts.cache import MessageDedup, TransactionalTaskLock
from src.core.contracts.messaging import (
    PublishedResult,
    ReplyDestination,
    ResultPublisher,
)
from src.core.contracts.queue import TaskQueue
from src.core.contracts.repositories import (
    ConversationRepository,
    MessageRepository,
    Repository,
    TaskRepository,
    UnitOfWork,
    UserRepository,
)
from src.core.contracts.storage import ArtifactStorage, WorkspaceProvider

__all__ = [
    "AgentBackend",
    "AgentExecutionContext",
    "AgentExecutionResult",
    "MessageDedup",
    "TransactionalTaskLock",
    "PublishedResult",
    "ReplyDestination",
    "ResultPublisher",
    "TaskQueue",
    "ConversationRepository",
    "MessageRepository",
    "Repository",
    "TaskRepository",
    "UnitOfWork",
    "UserRepository",
    "ArtifactStorage",
    "WorkspaceProvider",
]
