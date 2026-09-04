"""Map KOOK addressing data into the platform-neutral Core address."""

from __future__ import annotations

from src.core.entities.transport.address import ConversationAddress
from src.core.values import BotPlatform

__all__ = ["conversation_address"]


def conversation_address(
    *,
    channel_id: str,
    server_id: str | None = None,
    topic_id: str | None = None,
) -> ConversationAddress:
    """Build the stable Conversation address for a KOOK channel or DM."""
    return ConversationAddress(
        platform=BotPlatform.KOOK,
        space_id=server_id,
        room_id=channel_id,
        topic_id=topic_id,
    )
