"""KOOK's single entry point for inbound and outbound message conversion."""

from khl import Bot, Message

from src.core.contracts.messaging import (
    DeliveryReceipt, NormalizedIncoming, OutgoingMessage,
)
from src.plugins.platforms.kook.identity import conversation_address
from src.plugins.platforms.kook.normalizer import KookNormalizer


class KookMessageAdapter:
    def __init__(self, bot: Bot) -> None:
        self._normalizer = KookNormalizer(bot)

    async def normalize(self, message: Message) -> NormalizedIncoming | None:
        envelope = await self._normalizer.normalize(message)
        if envelope is None:
            return None
        guild = getattr(getattr(message, "ctx", None), "guild", None)
        address = conversation_address(
            server_id=getattr(guild, "id", None),
            channel_id=message.channel.id,
        )
        envelope.idempotency_key = f"kook:{message.id}"
        return NormalizedIncoming(envelope=envelope, address=address)

    async def publish(self, outgoing: OutgoingMessage) -> DeliveryReceipt:
        """P3 will implement delivery; never report success without sending."""
        raise NotImplementedError("KOOK outbound delivery is scheduled for P3")
