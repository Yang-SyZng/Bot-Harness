"""MySQL persistence plugin: repository implementations.

These implement the Core repository protocols against SQLAlchemy ``AsyncSession``
using the MySQL plugin ORM models. The mapper helpers translate between Core
entities (platform-neutral dataclasses) and the persisted rows.

Note on schema concurrency: the current ORM schema predates the Core entities
and uses a generic external-identifier naming plus integer foreign keys. The
translation here maps what the schema exposes today; a finer-grained
schema/domain alignment is a follow-up concern and does not change the
Application->Repository boundary this plugin establishes.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.entities.conversation import Conversation, ConversationIdentity
from src.core.entities.message import Message
from src.core.entities.task import Task
from src.core.entities.user import User
from src.core.values import TaskStatus
from src.plugins.persistence.mysql import models

__all__ = [
    "MySQLUserRepository",
    "MySQLConversationRepository",
    "MySQLTaskRepository",
    "MySQLMessageRepository",
]


# --------------------------------------------------------------------------
# Mappers: Core entity <-> ORM row
# --------------------------------------------------------------------------

def _user_from_row(row: models.User) -> User:
    return User(
        external_id=row.external_user_id,
        # The schema has no provider column yet; preserve "kook" as the
        # storage default until the schema is widened.
        provider="kook",
        display_name=row.display_name,
        created_at=row.created_at,
        updated_at=row.updated_at,
        id=row.id,
    )


def _conversation_from_row(row: models.Conversation) -> Conversation:
    return Conversation(
        identity=ConversationIdentity.from_mapping(row.dimensions or {}),
        active_task_id=(
            str(row.active_task_id) if row.active_task_id is not None else None
        ),
        created_at=row.created_at,
        updated_at=row.updated_at,
        id=row.id,
    )


def _task_from_row(row: models.Task) -> Task:
    return Task(
        conversation_id=row.conversation_id,
        status=TaskStatus(row.status or TaskStatus.QUEUED.value),
        title=row.title,
        agent_session_id=row.agent_session_id,
        previous_response_id=row.previous_response_id,
        workspace_path=row.workspace_path,
        created_at=row.created_at,
        updated_at=row.updated_at,
        completed_at=row.completed_at,
        id=row.id,
    )


def _message_from_row(row: models.Message) -> Message:
    return Message(
        task_id=str(row.task_id),
        role=row.role,
        content=row.content,
        id=row.id,
    )


# --------------------------------------------------------------------------
# Repositories
# --------------------------------------------------------------------------

class MySQLUserRepository:
    """``UserRepository`` backed by the MySQL ``users`` table."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_or_create(
        self,
        external_id: str,
        *,
        provider: str = "kook",
        display_name: str | None = None,
    ) -> User:
        row = (
            await self._session.execute(
                select(models.User).where(models.User.external_user_id == external_id)
            )
        ).scalar_one_or_none()
        if row is None:
            row = models.User(external_user_id=external_id, display_name=display_name)
            self._session.add(row)
            await self._session.flush()
        return _user_from_row(row)


class MySQLConversationRepository:
    """``ConversationRepository`` backed by the MySQL ``conversations`` table."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_or_create(self, identity: ConversationIdentity) -> Conversation:
        identity_key = str(identity)
        row = (
            await self._session.execute(
                select(models.Conversation).where(
                    models.Conversation.identity_key == identity_key
                )
            )
        ).scalar_one_or_none()
        if row is None:
            row = models.Conversation(
                identity_key=identity_key,
                dimensions=dict(identity.as_mapping()),
            )
            self._session.add(row)
            await self._session.flush()
        return _conversation_from_row(row)

    async def set_active_task(
        self,
        conversation_id: int,
        task_id: int,
    ) -> None:
        row = await self._session.get(models.Conversation, conversation_id)
        if row is not None:
            row.active_task_id = task_id


class MySQLTaskRepository:
    """``TaskRepository`` backed by the MySQL ``tasks`` table."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, task_id: str) -> Task | None:
        try:
            pk = int(task_id)
        except ValueError:
            return None
        row = await self._session.get(models.Task, pk)
        return _task_from_row(row) if row is not None else None

    async def add(self, task: Task) -> None:
        row = models.Task(
            conversation_id=int(task.conversation_id),
            title=task.title,
            status=task.status.value if isinstance(task.status, TaskStatus) else str(task.status),
            agent_session_id=task.agent_session_id,
            previous_response_id=task.previous_response_id,
            workspace_path=str(task.workspace_path) if task.workspace_path else None,
        )
        self._session.add(row)
        await self._session.flush()
        task.id = row.id

    async def save(self, task: Task) -> None:
        if task.id is None:
            await self.add(task)
            return
        row = await self._session.get(models.Task, task.id)
        if row is None:
            return
        row.title = task.title
        row.status = (
            task.status.value if isinstance(task.status, TaskStatus) else str(task.status)
        )
        row.agent_session_id = task.agent_session_id
        row.previous_response_id = task.previous_response_id
        row.workspace_path = (
            str(task.workspace_path) if task.workspace_path else None
        )
        row.completed_at = task.completed_at


class MySQLMessageRepository:
    """``MessageRepository`` backed by the MySQL ``messages`` table."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, message: Message) -> None:
        row = models.Message(
            task_id=int(message.task_id),
            # No sender id on the domain object; keep the schema value empty-ish.
            external_message_id=f"task-{message.task_id}",
            role=_role_as_str(message.role),
            content=message.content,
        )
        self._session.add(row)
        await self._session.flush()
        message.id = row.id

    async def list_for_task(
        self,
        task_id: str,
        *,
        limit: int | None = None,
    ) -> list[Message]:
        stmt = (
            select(models.Message)
            .where(models.Message.task_id == int(task_id))
            .order_by(models.Message.id)
        )
        if limit is not None:
            stmt = stmt.limit(limit)
        rows = (await self._session.execute(stmt)).scalars().all()
        return [_message_from_row(r) for r in rows]


def _role_as_str(role) -> str:
    if hasattr(role, "value"):  # MessageRole.USER / ASSISTANT enums
        return role.value
    return str(role)
