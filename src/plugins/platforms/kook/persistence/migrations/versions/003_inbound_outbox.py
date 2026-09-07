"""Add durable execution requests for atomic inbound acceptance."""

from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "outbox_events",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("run_id", sa.String(32), sa.ForeignKey("agent_runs.id"),
                  nullable=False, unique=True),
        sa.Column("envelope_id", sa.String(32),
                  sa.ForeignKey("message_envelopes.id"), nullable=False, unique=True),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("published_at", sa.BigInteger(), nullable=True),
    )
    op.create_index("ix_outbox_pending", "outbox_events",
                    ["published_at", "created_at", "id"])


def downgrade() -> None:
    op.drop_table("outbox_events")
