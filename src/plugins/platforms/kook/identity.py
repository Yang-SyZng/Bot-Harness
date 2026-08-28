"""KOOK platform adapter: build platform-neutral Core identities.

This maps KOOK's addressing dimensions (server/channel/user) into the generic
:class:`~src.core.entities.conversation.ConversationIdentity` that Core uses,
so Core never carries KOOK-specific fields.
"""

from __future__ import annotations

from src.core.entities.conversation import ConversationIdentity

__all__ = ["conversation_identity"]


def conversation_identity(
    *,
    user_id: str,
    channel_id: str,
    server_id: str | None = None,
) -> ConversationIdentity:
    """Build a Core ``ConversationIdentity`` from KOOK dimensions.

    Only non-empty dimensions are included, so conversations scoped purely by
    channel/user (no guild) still map cleanly.
    """
    dimensions: dict[str, str] = {"user_id": user_id, "channel_id": channel_id}
    if server_id:
        dimensions["server_id"] = server_id
    return ConversationIdentity.from_mapping(dimensions)
