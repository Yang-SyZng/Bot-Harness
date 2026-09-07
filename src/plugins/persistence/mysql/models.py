"""SQLAlchemy models for the Conversation/Session persistence graph."""

from __future__ import annotations

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from src.plugins.persistence.mysql.database.base import Base

ID = String(32)


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint("address_key", name="uq_conversations_address_key"),
    )

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    address_key: Mapped[str] = mapped_column(String(64), nullable=False)
    address_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    conversation_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    parent_id: Mapped[str | None] = mapped_column(
        ID, ForeignKey("conversations.id"), nullable=True
    )
    created_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    last_message_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    role: Mapped[str | None] = mapped_column(String(32), nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    attachments_json: Mapped[list | None] = mapped_column(JSON, nullable=True)


class MessageEnvelope(Base):
    __tablename__ = "message_envelopes"
    __table_args__ = (
        UniqueConstraint(
            "conversation_id",
            "idempotency_key",
            name="uq_envelopes_conversation_idempotency",
        ),
        UniqueConstraint(
            "conversation_id",
            "external_message_id",
            name="uq_envelopes_conversation_external_message",
        ),
        Index("ix_envelopes_conversation_order", "conversation_id", "received_at", "id"),
    )

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    version: Mapped[str] = mapped_column(String(16), nullable=False, default="v0.1")
    conversation_id: Mapped[str] = mapped_column(
        ID, ForeignKey("conversations.id"), nullable=False
    )
    message_id: Mapped[str | None] = mapped_column(
        ID, ForeignKey("messages.id"), nullable=True, unique=True
    )
    sender_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    recipient_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    connector_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    external_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_reply_to_message_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    reply_to_envelope_id: Mapped[str | None] = mapped_column(
        ID, ForeignKey("message_envelopes.id"), nullable=True
    )
    direction: Mapped[str | None] = mapped_column(String(32), nullable=True)
    transport_flow: Mapped[str | None] = mapped_column(String(32), nullable=True)
    occurred_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    received_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(512), nullable=True)


class Session(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        Index(
            "ix_sessions_active_owner",
            "conversation_id",
            "owner_user_id",
            "status",
        ),
    )

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    conversation_id: Mapped[str] = mapped_column(
        ID, ForeignKey("conversations.id"), nullable=False
    )
    owner_user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    parent_session_id: Mapped[str | None] = mapped_column(
        ID, ForeignKey("sessions.id"), nullable=True
    )
    covers_through_envelope_id: Mapped[str | None] = mapped_column(
        ID, ForeignKey("message_envelopes.id"), nullable=True
    )
    goal: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    version: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    updated_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)


class SessionEnvelope(Base):
    __tablename__ = "session_envelopes"
    __table_args__ = (
        UniqueConstraint(
            "session_id", "sequence_no", name="uq_session_envelopes_sequence"
        ),
        Index("ix_session_envelopes_envelope", "envelope_id"),
    )

    session_id: Mapped[str] = mapped_column(
        ID, ForeignKey("sessions.id"), primary_key=True
    )
    envelope_id: Mapped[str] = mapped_column(
        ID, ForeignKey("message_envelopes.id"), primary_key=True
    )
    sequence_no: Mapped[int] = mapped_column(Integer, nullable=False)
    relation_role: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)


class Asset(Base):
    __tablename__ = "assets"
    __table_args__ = (Index("ix_assets_sha256", "sha256"),)

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    original_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    storage_key: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    safe_to_share: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)


class AgentRun(Base):
    __tablename__ = "agent_runs"
    __table_args__ = (
        UniqueConstraint("session_id", "attempt", name="uq_agent_runs_attempt"),
    )

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ID, ForeignKey("sessions.id"), nullable=False
    )
    attempt: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    backend: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    worker_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    started_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    completed_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)


class OutboxEvent(Base):
    __tablename__ = "outbox_events"
    __table_args__ = (Index("ix_outbox_pending", "published_at", "created_at", "id"),)

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    run_id: Mapped[str] = mapped_column(ID, ForeignKey("agent_runs.id"), unique=True)
    envelope_id: Mapped[str] = mapped_column(
        ID, ForeignKey("message_envelopes.id"), unique=True
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    published_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)


__all__ = [
    "OutboxEvent",
    "Conversation",
    "Message",
    "MessageEnvelope",
    "Session",
    "SessionEnvelope",
    "Asset",
    "AgentRun",
]
