import asyncio
import logging

from agents import set_tracing_disabled
from khl import Bot, Message

from src import AppSettings
from src.core.entities.transport.envelope import MessageEnvelope
from src.plugins.platforms.kook.ingress import KookIngress
from src.plugins.platforms.kook.normalizer import KookNormalizer

log = logging.getLogger(__name__)


def build_bot(settings: AppSettings | None = None) -> Bot:
    """Build and configure the KOOK bot.

    Args:
        settings: Optional application settings. If omitted, settings are loaded
            from the environment.

    Returns:
        The configured KOOK bot instance.
    """
    settings = settings or AppSettings()
    bot = Bot(token=settings.platform_token.get_secret_value())
    normalizer = KookNormalizer(bot)

    async def inbound_handler(envelope: MessageEnvelope) -> None:
        """Temporary inbound handler: currently logs the normalized envelope.

        The envelope stops here so the receive path can be exercised up to
        normalization (message in → normalizer → MessageEnvelope). Real session
        routing / context building / agent execution plug in here next.
        """
        log.info(
            "inbound envelope idempotency_key=%s conversation_id=%s msgs=%d",
            envelope.idempotency_key,
            envelope.conversation_id,
            len(envelope.messages or []),
        )

    ingress = KookIngress(normalizer=normalizer, handler=inbound_handler)

    set_tracing_disabled(True)

    @bot.on_message()
    async def receive(msg: Message) -> None:
        """Forward an incoming KOOK message to the ingress handler.

        Args:
            msg: Incoming KOOK message.
        """
        await ingress.handle(msg)

    return bot


def run(initialize_db: bool = False) -> None:
    """Initialize persistent storage if requested, then boot the KOOK bot.

    Args:
        initialize_db: When True, ensure the KOOK MySQL schema exists and is up
            to date (migrate via Alembic, then verify) before starting the bot.
    """
    if initialize_db:
        from src.plugins.platforms.kook.persistence.initialize import initialize

        print(initialize().summary())

    asyncio.set_event_loop(asyncio.new_event_loop())
    bot = build_bot()

    bot.run()
