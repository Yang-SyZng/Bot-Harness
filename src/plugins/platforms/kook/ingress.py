import logging
from collections.abc import Awaitable, Callable

from khl import Message

from src.core.entities.transport.envelope import MessageEnvelope
from src.plugins.platforms.kook.normalizer import KookNormalizer

log = logging.getLogger(__name__)

__all__ = ["KookIngress"]

# An inbound handler consumes a normalized ``MessageEnvelope``.
EnvelopeHandler = Callable[[MessageEnvelope], Awaitable[None]]


class KookIngress:
    """KOOK adapter: convert input and dispatch the normalized envelope.

    This thin adapter only normalizes an incoming KOOK message into a core
    ``MessageEnvelope`` and hands it to the inbound handler. All orchestration
    (routing, session, context, execution) lives in the application layer.
    """

    def __init__(
        self,
        *,
        normalizer: KookNormalizer,
        handler: EnvelopeHandler,
    ) -> None:
        """Initialize the KOOK message ingress handler.

        Args:
            normalizer: Normalizer converting KOOK messages to ``MessageEnvelope``.
            handler: Application handler that consumes a normalized envelope.
        """
        self._normalizer = normalizer
        self._handler = handler

    async def handle(self, msg: Message) -> None:
        """Normalize ``msg`` and dispatch the envelope to the handler.

        Args:
            msg: Incoming KOOK message.
        """
        envelope = await self._normalizer.normalize(msg)
        if envelope is None:
            return
        await self._handler(envelope)
