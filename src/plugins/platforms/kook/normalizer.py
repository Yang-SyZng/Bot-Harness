import json
import re
from typing import List

from khl import Bot, Message, MessageTypes

from src.core.entities.message import Message
from src.core.entities.transport.actor import ActorRef
from src.core.entities.transport.attachments import Attachment
from src.core.entities.transport.envelope import MessageEnvelope
from src.core.entities.transport.transport import TransportRef
from src.core.values import (
    ActorRefType,
    AttachmentKind,
    MessageEnvelopeDirectionType,
    MessageEnvelopeTransportFlowType,
    now_ms,
)

__all__ = ["KookNormalizer"]


class KookNormalizer:
    """Convert KOOK messages into the application's ``MessageEnvelope`` model."""

    def __init__(self, bot: Bot) -> None:
        """Initialize the KOOK message normalizer.

        Args:
            bot: KOOK bot used to identify the current bot account.
        """
        self._bot = bot

    async def normalize(self, msg: Message) -> MessageEnvelope | None:
        """Normalize an incoming KOOK message into a ``MessageEnvelope``.

        Messages sent by bots, messages that do not mention the current bot, and
        malformed card messages are ignored.

        Args:
            msg: Incoming KOOK message to normalize.

        Returns:
            The normalized envelope, or ``None`` if the message should be ignored.
            ``conversation_id`` is left unset here (platform-agnostic mapping); it
            is resolved by the inbound use case against a ``Conversation``.
        """
        # Skip the robot itself and messages that do not mention the bot.
        bot_user = await self._bot.client.fetch_me()
        # if getattr(msg.author, "bot", False) or msg.author_id == bot_user.id:
        #     return None
        if bot_user.id not in (msg.extra.get("mention") or []):
            return None

        text = msg.content or ""
        attachments: List[Attachment] = []

        if msg.type == MessageTypes.KMD:
            text = (msg.extra.get("kmarkdown") or {}).get("raw_content") or text
        elif msg.type == MessageTypes.CARD:
            text_parts = []
            try:
                cards = json.loads(text)
            except (TypeError, json.JSONDecodeError):
                return None
            for card in cards:
                for module in card.get("modules", []):
                    module_type = module.get("type")
                    if module_type == "section":
                        content = (module.get("text") or {}).get("content")
                        if content:
                            text_parts.append(content)
                        accessory = module.get("accessory") or {}
                        if accessory.get("type") == "image" and accessory.get("src"):
                            attachments.append(_image_attachment(accessory))
                    elif module_type in {"container", "image-group", "context"}:
                        for element in module.get("elements", []):
                            src = element.get("src")
                            if src:
                                attachments.append(_media_attachment(element, src))
                    elif module_type in {"file", "audio", "video"} and module.get("src"):
                        attachments.append(_media_attachment(module, module["src"]))
            text = "\n".join(text_parts)
        text = re.sub(rf"\(met\){re.escape(bot_user.id)}\(met\)", "", text)
        text = re.sub(rf"<@!?{re.escape(bot_user.id)}>", "", text).strip()

        now = now_ms()
        return MessageEnvelope(
            conversation_id=None,  # resolved by the inbound use case
            messages=Message(
                content=text or None,
                attachments=attachments, 
                reply_to_id=None,
                sent_at=now),
            sender=ActorRef(
                external_id=msg.author.id,
                actor_type=ActorRefType.PEOPLE,
                display_name=msg.author.nickname,
                avatar=msg.author.vip_avatar
            ),
            # recipient=,
            transport=TransportRef(
                external_event_id=msg.id,
                external_message_id=msg.id,
            ),
            direction=MessageEnvelopeDirectionType.P2B,
            transport_flow=MessageEnvelopeTransportFlowType.INBOUND,
            received_at=now,
            idempotency_key=msg.id,
        )


def _image_attachment(accessory: dict) -> Attachment:
    """Build an image Attachment from a section accessory."""
    return Attachment(
        f_type=AttachmentKind.IMAGE,
        name=accessory.get("alt"),
        source_url=accessory.get("src"),
    )


def _media_attachment(node: dict, src: str) -> Attachment:
    """Build an Attachment from a media element/file/audio/video node."""
    node_type = node.get("type")
    if node_type == "image":
        kind = AttachmentKind.IMAGE
    elif node_type == "audio":
        kind = AttachmentKind.AUDIO
    elif node_type == "video":
        kind = AttachmentKind.VIDEO
    elif node_type in {"file", "image-group", "container", "context"}:
        kind = AttachmentKind.FILE
    else:
        kind = AttachmentKind.FILE
    return Attachment(
        f_type=kind,
        name=node.get("title") or node.get("name"),
        mime_type=node.get("mime_type"),
        source_url=src,
    )
