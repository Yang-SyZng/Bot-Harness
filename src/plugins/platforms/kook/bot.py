import asyncio
import logging

from agents import set_tracing_disabled
from khl import Bot, Message

from src import AppSettings
from src.application.ingest_envelope import IngestEnvelope
from src.plugins.persistence.fake import FakeUnitOfWork, MemoryStore
from src.plugins.platforms.kook.identity import conversation_address
from src.plugins.platforms.kook.normalizer import KookNormalizer

log = logging.getLogger(__name__)


def build_bot(settings: AppSettings | None = None) -> Bot:
    """Build and configure the KOOK bot.

    Inbound KOOK messages are normalized into a ``MessageEnvelope``; the
    conversation is located/created once by its channel address (a Conversation
    keeps the sole address); the envelope only receives the resolved
    ``conversation_id`` and is persisted under it.
    """

    settings = settings or AppSettings()
    bot = Bot(token=settings.platform_token.get_secret_value())
    normalizer = KookNormalizer(bot)

    # In-memory persistence (Fake). Swap to a MySQL-backed UnitOfWork once the
    # mysql persistence plugin is rebuilt; the same use case accepts it.
    _store = MemoryStore()

    def _make_uow() -> FakeUnitOfWork:
        return FakeUnitOfWork(_store)

    ingest = IngestEnvelope(make_uow=_make_uow)

    @bot.on_message()
    async def receive(msg: Message) -> None:
        """Normalize an incoming KOOK message, locate its conversation, ingest."""
        envelope = await normalizer.normalize(msg)
        if envelope is None:
            return
        guild = getattr(getattr(msg, "ctx", None), "guild", None)
        server_id = getattr(guild, "id", None)
        address = conversation_address(
            server_id=server_id,
            channel_id=msg.channel.id,
        )
        envelope.conversation_id = await ingest.ensure_conversation(address)
        await ingest.handle(envelope)
        log.info("ingested envelope id=%s conversation_id=%s", envelope.id, envelope.conversation_id)

    set_tracing_disabled(True)
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
