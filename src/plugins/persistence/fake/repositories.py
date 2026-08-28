"""Fake in-memory repositories.

Each repository keeps its records in a mutable in-memory store. One shared store
object can be handed to several repositories so a ``FakeUnitOfWork`` transaction
sees consistent data across users / conversations / tasks / messages.
"""

from __future__ import annotations

from src.core.entities.conversation import Conversation, ConversationIdentity
from src.core.entities.message import Message
from src.core.entities.task import Task
from src.core.entities.user import User

__all__ = [
    "MemoryStore",
    "FakeUserRepository",
    "FakeConversationRepository",
    "FakeTaskRepository",
    "FakeMessageRepository",
]


class MemoryStore:
    """Shared in-memory backing store used by all fake repositories."""

    def __init__(self) -> None:
        self.users: dict[str, User] = {}
        self.conversations: dict[str, Conversation] = {}
        self.tasks: dict[int, Task] = {}
        self.messages: list[Message] = []
        self._next_user = 1
        self._next_conversation = 1
        self._next_task = 1
        self._next_message = 1

    def next_user_id(self) -> int:
        uid = self._next_user
        self._next_user += 1
        return uid

    def next_conversation_id(self) -> int:
        cid = self._next_conversation
        self._next_conversation += 1
        return cid

    def next_task_id(self) -> int:
        tid = self._next_task
        self._next_task += 1
        return tid

    def next_message_id(self) -> int:
        mid = self._next_message
        self._next_message += 1
        return mid


class FakeUserRepository:
    """``UserRepository`` stored in memory, keyed by external_id."""

    def __init__(self, store: MemoryStore) -> None:
        self._store = store

    def _key(self) -> str:
        return "user"

    async def get_or_create(
        self,
        external_id: str,
        *,
        provider: str,
        display_name: str | None = None,
    ) -> User:
        key = (external_id, provider)
        existing = self._store.users.get(key)
        if existing is not None:
            return existing
        user = User(
            external_id=external_id,
            provider=provider,
            display_name=display_name,
            id=self._store.next_user_id(),
        )
        self._store.users[key] = user
        return user


class FakeConversationRepository:
    """``ConversationRepository`` stored in memory, keyed by identity."""

    def __init__(self, store: MemoryStore) -> None:
        self._store = store

    async def get_or_create(self, identity: ConversationIdentity) -> Conversation:
        key = str(identity)
        existing = self._store.conversations.get(key)
        if existing is not None:
            return existing
        conversation = Conversation(identity=identity)
        conversation.id = self._store.next_conversation_id()
        self._store.conversations[key] = conversation
        return conversation

    async def set_active_task(
        self,
        conversation_id: int,
        task_id: int,
    ) -> None:
        for conversation in self._store.conversations.values():
            if conversation.id == conversation_id:
                conversation.active_task_id = str(task_id)
                return


class FakeTaskRepository:
    """``TaskRepository`` stored in memory, keyed by incremental id."""

    def __init__(self, store: MemoryStore) -> None:
        self._store = store

    async def get(self, task_id: str) -> Task | None:
        try:
            pk = int(task_id)
        except ValueError:
            return None
        return self._store.tasks.get(pk)

    async def add(self, task: Task) -> None:
        task.id = self._store.next_task_id()
        self._store.tasks[task.id] = task

    async def save(self, task: Task) -> None:
        if task.id is not None and task.id in self._store.tasks:
            self._store.tasks[task.id] = task


class FakeMessageRepository:
    """``MessageRepository`` stored in memory."""

    def __init__(self, store: MemoryStore) -> None:
        self._store = store

    async def add(self, message: Message) -> None:
        message.id = self._store.next_message_id()
        self._store.messages.append(message)

    async def list_for_task(
        self,
        task_id: str,
        *,
        limit: int | None = None,
    ) -> list[Message]:
        items = [m for m in self._store.messages if m.task_id == task_id]
        if limit is not None:
            items = items[-limit:]
        return items
