import asyncio
import logging
from collections.abc import Callable

from agents import set_tracing_disabled
from khl import Bot, Message

from src import AppSettings
from src.application.accept_incoming_envelope import AcceptIncomingEnvelope
from src.core.contracts.repositories import UnitOfWork
from src.plugins.persistence.fake import FakeUnitOfWork, MemoryStore
from src.plugins.platforms.kook.message_adapter import KookMessageAdapter

log = logging.getLogger(__name__)


def build_bot(settings: AppSettings | None = None, *,
              make_uow: Callable[[], UnitOfWork] | None = None) -> Bot:
    """Build and configure the KOOK bot.

    Inbound KOOK messages are normalized into a ``MessageEnvelope``; the
    conversation is located/created once by its channel address (a Conversation
    keeps the sole address); the envelope only receives the resolved
    ``conversation_id`` and is persisted under it.
    """

    settings = settings or AppSettings()
    bot = Bot(token=settings.platform_token.get_secret_value())
    adapter = KookMessageAdapter(bot)

    # Development default. Inject MySQLUnitOfWork for durable acceptance.
    _store = MemoryStore()

    def _make_uow() -> FakeUnitOfWork:
        return FakeUnitOfWork(_store)

    accept = AcceptIncomingEnvelope(make_uow=make_uow or _make_uow)

    @bot.on_message()
    async def receive(msg: Message) -> None:
        """Normalize an incoming KOOK message, locate its conversation, ingest."""
        incoming = await adapter.normalize(msg)
        if incoming is None:
            return
        result = await accept.execute(incoming)
        log.info("%s envelope=%s conversation=%s run=%s", result.status,
                 result.envelope_id, result.conversation_id, result.run_id)

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
