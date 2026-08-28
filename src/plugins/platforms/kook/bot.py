import asyncio

from agents import set_tracing_disabled
from khl import Bot, Message

from src import AppSettings
from src.plugins.tools.attachments import AttachmentDownloader
from src.plugins.platforms.kook.ingress import KookIngress
from src.plugins.platforms.kook.normalizer import KookNormalizer
from src.plugins.platforms.kook.renderer import KookRenderer
from src.agent.service import AgentService
from src.application.execute_task import ExecuteTask
from src.application.handle_incoming_message import HandleIncomingMessage
from src.application.task_router import TaskRouter
from src.runtime.dedupe import MessageDeduplicator
from src.runtime.workspace import TaskWorkspaceProvider

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

    runner = AgentService(settings)
    executor = ExecuteTask(runner)

    renderer = KookRenderer(bot.client, language=settings.language)

    downloader = AttachmentDownloader(max_bytes=settings.max_attachment_bytes)
    dedupe = MessageDeduplicator(settings.workspace_root / ".dedupe")

    handle_message = HandleIncomingMessage(
        dedup=dedupe,
        router=TaskRouter(),
        workspaces=TaskWorkspaceProvider(settings.workspace_root),
        downloader=downloader,
        executor=executor,
    )

    ingress = KookIngress(
        normalizer=normalizer,
        handle_message=handle_message,
        renderer=renderer,
    )

    set_tracing_disabled(True)

    @bot.on_message()
    async def receive(msg: Message) -> None:
        """Forward an incoming KOOK message to the ingress handler.

        Args:
            msg: Incoming KOOK message.
        """
        await ingress.handle(msg)

    return bot


def run(initialize_db: bool = True) -> None:
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
