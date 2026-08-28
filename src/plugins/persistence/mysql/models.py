"""MySQL persistence plugin models.

SQLAlchemy ORM models owned by the MySQL persistence plugin. They model the
conversation graph:

    User  ->  Conversation  ->  Task  ->  Message / TaskEvent / Artifact
    User  ->  Memory

They only rely on the plugin's declarative ``Base`` (the MySQL plugin database
framework) so the shared infrastructure stays technology-neutral and free of any
particular schema. The schema is versioned through Alembic; do not edit
tables directly in DDL.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from src.plugins.persistence.mysql.database.base import Base


class User(Base):
    """A user that interacts with the bot (one row per unique external id)."""

    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("external_user_id", name="uq_users_external_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    # Stable external user identifier, unique across the table.
    external_user_id: Mapped[str] = mapped_column(String(128), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class Conversation(Base):
    """A long-lived conversation, addressed by a platform-neutral identity.

    The addressing dimensions (server, channel, user, ...) are stored in the
    open-ended ``dimensions`` JSON column, and ``identity_key`` is the
    deterministic identity string used for uniqueness — mirroring the Core
    ``ConversationIdentity`` so no concrete platform's fields are hard-coded.
    """

    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint("identity_key", name="uq_conversations_identity_key"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    # Deterministic normalized identity string (see ConversationIdentity.__str__).
    identity_key: Mapped[str] = mapped_column(String(512), nullable=False)
    # Platform-neutral addressing dimensions as key/value object.
    dimensions: Mapped[dict] = mapped_column(JSON, nullable=False)
    # Currently active task for this conversation (soft reference, may be NULL).
    # No DB-level FK because it points back to tasks and would create a
    # circular dependency with tasks.conversation_id.
    active_task_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class Task(Base):
    """A unit of work within a conversation, tied to an agent session."""

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("conversations.id"), nullable=False
    )
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # QUEUED / RUNNING / WAITING_USER / COMPLETED / FAILED / CANCELLED / TIMED_OUT.
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="QUEUED")
    agent_session_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    previous_response_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    workspace_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Message(Base):
    """One message within a task; the row-append-only conversation history."""

    __tablename__ = "messages"
    __table_args__ = (
        UniqueConstraint("external_message_id", name="uq_messages_external_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tasks.id"), nullable=False
    )
    # Original external message id; unique constraint provides DB-level idempotency.
    external_message_id: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)  # user / assistant
    content: Mapped[str] = mapped_column(Text, nullable=False)
    attachments_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )


class TaskEvent(Base):
    """Audit log of state transitions and progress events for a task."""

    __tablename__ = "task_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tasks.id"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )


class Artifact(Base):
    """Metadata for a generated file; the payload stays in the task workspace."""

    __tablename__ = "artifacts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tasks.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    path: Mapped[str] = mapped_column(String(1024), nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    safe_to_share: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )


class Memory(Base):
    """A structured long-term memory record owned by a user."""

    __tablename__ = "memories"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source_task_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("tasks.id"), nullable=True
    )
    source_message_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("messages.id"), nullable=True
    )
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


__all__ = [
    "User",
    "Conversation",
    "Task",
    "Message",
    "TaskEvent",
    "Artifact",
    "Memory",
]
