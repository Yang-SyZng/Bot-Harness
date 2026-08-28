import logging

from khl import Message

from src.plugins.platforms.kook.normalizer import KookNormalizer
from src.plugins.platforms.kook.renderer import KookRenderer
from src.application.handle_incoming_message import HandleIncomingMessage

log = logging.getLogger(__name__)


class KookIngress:
    """KOOK adapter: convert input and render results — nothing else.

    This thin adapter only wires the incoming KOOK message into the application
    ``HandleIncomingMessage`` use case and hands the resulting outcome to the
    renderer. All orchestration, routing, dedup, workspace and agent execution
    live in the application layer.
    """

    def __init__(
        self,
        *,
        normalizer: KookNormalizer,
        handle_message: HandleIncomingMessage,
        renderer: KookRenderer,
    ) -> None:
        """Initialize the KOOK message ingress handler.

        Args:
            normalizer: Normalizer used to convert KOOK messages into internal
                message models.
            handle_message: Application use case that processes incoming messages.
            renderer: Renderer used to send the outcome back to KOOK.
        """
        self._normalizer = normalizer
        self._handle_message = handle_message
        self._renderer = renderer

    async def handle(self, msg: Message) -> None:
        """Process an incoming KOOK message and render the outcome.

        Args:
            msg: Incoming KOOK message.

        Returns:
            None.
        """
        incoming = await self._normalizer.normalize(msg)
        if incoming is None:
            return

        outcome = await self._handle_message.execute(incoming)
        await self._renderer.render(msg, outcome)
