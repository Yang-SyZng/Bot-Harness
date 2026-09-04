"""Replace the legacy User/Task schema with Conversation/Session persistence.

Revision ID: 002
Revises: 001

Legacy tables are renamed instead of dropped so an existing alpha database does
not lose data during the structural transition. They are not used by the new
ORM and may be migrated or removed explicitly later.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_LEGACY_TABLES = (
    "memories",
    "artifacts",
    "task_events",
    "messages",
    "tasks",
    "conversations",
    "users",
)


def upgrade() -> None:
    """Preserve the legacy schema and create the new persistence graph."""
    for table in _LEGACY_TABLES:
        op.rename_table(table, f"legacy_001_{table}")

    op.create_table(
        "conversations",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("address_key", sa.String(length=64), nullable=False),
        sa.Column("address_json", sa.JSON(), nullable=False),
        sa.Column("conversation_type", sa.String(length=32), nullable=True),
        sa.Column("parent_id", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.BigInteger(), nullable=True),
        sa.Column("last_message_at", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(["parent_id"], ["conversations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("address_key", name="uq_conversations_address_key"),
    )

    op.create_table(
        "messages",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("attachments_json", sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "message_envelopes",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("version", sa.String(length=16), nullable=False),
        sa.Column("conversation_id", sa.String(length=32), nullable=False),
        sa.Column("message_id", sa.String(length=32), nullable=True),
        sa.Column("sender_json", sa.JSON(), nullable=True),
        sa.Column("recipient_json", sa.JSON(), nullable=True),
        sa.Column("connector_json", sa.JSON(), nullable=True),
        sa.Column("external_event_id", sa.String(length=255), nullable=True),
        sa.Column("external_message_id", sa.String(length=255), nullable=True),
        sa.Column(
            "external_reply_to_message_id", sa.String(length=255), nullable=True
        ),
        sa.Column("reply_to_envelope_id", sa.String(length=32), nullable=True),
        sa.Column("direction", sa.String(length=32), nullable=True),
        sa.Column("transport_flow", sa.String(length=32), nullable=True),
        sa.Column("occurred_at", sa.BigInteger(), nullable=True),
        sa.Column("received_at", sa.BigInteger(), nullable=True),
        sa.Column("idempotency_key", sa.String(length=512), nullable=True),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"]),
        sa.ForeignKeyConstraint(
            ["reply_to_envelope_id"], ["message_envelopes.id"]
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("message_id"),
        sa.UniqueConstraint(
            "conversation_id",
            "idempotency_key",
            name="uq_envelopes_conversation_idempotency",
        ),
        sa.UniqueConstraint(
            "conversation_id",
            "external_message_id",
            name="uq_envelopes_conversation_external_message",
        ),
    )
    op.create_index(
        "ix_envelopes_conversation_order",
        "message_envelopes",
        ["conversation_id", "received_at", "id"],
    )

    op.create_table(
        "sessions",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("conversation_id", sa.String(length=32), nullable=False),
        sa.Column("owner_user_id", sa.String(length=255), nullable=False),
        sa.Column("parent_session_id", sa.String(length=32), nullable=True),
        sa.Column("covers_through_envelope_id", sa.String(length=32), nullable=True),
        sa.Column("goal", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("idempotency_key", sa.String(length=512), nullable=True),
        sa.Column("version", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.BigInteger(), nullable=True),
        sa.Column("updated_at", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
        sa.ForeignKeyConstraint(
            ["covers_through_envelope_id"], ["message_envelopes.id"]
        ),
        sa.ForeignKeyConstraint(["parent_session_id"], ["sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_sessions_active_owner",
        "sessions",
        ["conversation_id", "owner_user_id", "status"],
    )

    op.create_table(
        "session_envelopes",
        sa.Column("session_id", sa.String(length=32), nullable=False),
        sa.Column("envelope_id", sa.String(length=32), nullable=False),
        sa.Column("sequence_no", sa.Integer(), nullable=False),
        sa.Column("relation_role", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(["envelope_id"], ["message_envelopes.id"]),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"]),
        sa.PrimaryKeyConstraint("session_id", "envelope_id"),
        sa.UniqueConstraint(
            "session_id", "sequence_no", name="uq_session_envelopes_sequence"
        ),
    )
    op.create_index(
        "ix_session_envelopes_envelope", "session_envelopes", ["envelope_id"]
    )

    op.create_table(
        "assets",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("original_name", sa.String(length=255), nullable=True),
        sa.Column("mime_type", sa.String(length=255), nullable=True),
        sa.Column("size", sa.BigInteger(), nullable=True),
        sa.Column("sha256", sa.String(length=64), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("storage_key", sa.String(length=1024), nullable=True),
        sa.Column("safe_to_share", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.BigInteger(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assets_sha256", "assets", ["sha256"])

    op.create_table(
        "agent_runs",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("session_id", sa.String(length=32), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("backend", sa.String(length=64), nullable=True),
        sa.Column("model", sa.String(length=255), nullable=True),
        sa.Column("worker_id", sa.String(length=255), nullable=True),
        sa.Column("started_at", sa.BigInteger(), nullable=True),
        sa.Column("completed_at", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id", "attempt", name="uq_agent_runs_attempt"),
    )


def downgrade() -> None:
    """Drop the new graph and restore the untouched legacy table names."""
    op.drop_table("agent_runs")
    op.drop_index("ix_assets_sha256", table_name="assets")
    op.drop_table("assets")
    op.drop_index(
        "ix_session_envelopes_envelope", table_name="session_envelopes"
    )
    op.drop_table("session_envelopes")
    op.drop_index("ix_sessions_active_owner", table_name="sessions")
    op.drop_table("sessions")
    op.drop_index(
        "ix_envelopes_conversation_order", table_name="message_envelopes"
    )
    op.drop_table("message_envelopes")
    op.drop_table("messages")
    op.drop_table("conversations")

    for table in reversed(_LEGACY_TABLES):
        op.rename_table(f"legacy_001_{table}", table)
