"""This code mainly describes the initialization of the Kook database.
   ZN-CN: 这个代码主要描述的是 Kook 数据库的初始化

Runs once before the bot and workers boot:

    1. connect to MySQL (sync engine, PyMySQL),
    2. acquire a cross-process named lock,
    3. check the schema version (alembic_version),
    4. migrate to head  (creates all tables / upgrades / no-ops when current),
    5. verify the expected tables and columns are present,
    6. release the lock.

This is intentionally a synchronous, startup-time function: it executes before
an asyncio event loop is running, so calling Alembic (which itself wraps the
async runner) is safe here rather than from the async middleware layer.
"""

from __future__ import annotations

from dataclasses import dataclass

from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

from src import global_settings
from src.plugins.platforms.kook.persistence import metadata
from src.plugins.persistence.mysql.database import (
    create_sync_engine_from_settings,
    mysql_named_lock,
    verify_schema,
)
from src.plugins.persistence.mysql.database.engine import build_database_url

INIT_LOCK_NAME = "kookbot:db:init"
_ALEMBIC_INI = __import__("pathlib").Path(__file__).resolve().parent / "alembic.ini"


@dataclass
class InitResult:
    """Describe what initialization did."""

    already_at_head: bool
    version_before: str | None
    version_after: str | None
    tables: list[str]

    def summary(self) -> str:
        if self.version_before is None:
            action = "created full schema"
        elif self.already_at_head:
            action = "already at latest version"
        else:
            action = f"migrated {self.version_before} -> {self.version_after}"
        return f"[db-init] {action}; tables: {', '.join(self.tables)}"


def _alembic_config() -> Config:
    """Build an Alembic `Config` pointed at the adapter's migration scripts.

    The URL is injected explicitly so the programmatic run does not rely on a
    pre-configured `sqlalchemy.url` in the ini.
    """
    cfg = Config(str(_ALEMBIC_INI))
    url = build_database_url(
        host=global_settings.sql_host,
        port=global_settings.sql_port,
        user=global_settings.sql_user,
        password=global_settings.sql_passwd,
        database=global_settings.sql_database,
    )
    cfg.set_main_option("script_location", str(_ALEMBIC_INI.parent / "migrations"))
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


def _current_version(connection: Connection) -> str | None:
    """Return the current alembic_version, or None when the table is absent."""
    try:
        row = connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).first()
    except Exception:
        return None
    return row[0] if row else None


def initialize(lock_timeout: float = 30.0) -> InitResult:
    """Ensure the KOOK schema exists and is up to date, then return a report.

    Args:
        lock_timeout: Seconds to wait for the initialization lock.

    Returns:
        An :class:`InitResult` describing what was applied and the tables now
        present.

    Raises:
        src.plugins.persistence.mysql.database.LockNotAcquired: If another process holds the init lock.
        RuntimeError: If the schema fails to verify after migration.
    """
    engine: Engine = create_sync_engine_from_settings()
    try:
        with mysql_named_lock(engine, INIT_LOCK_NAME, timeout=lock_timeout):
            return _run_initialization(engine)
    finally:
        engine.dispose()


def _run_initialization(engine: Engine) -> InitResult:
    with engine.connect() as connection:
        version_before = _current_version(connection)

    command.upgrade(_alembic_config(), "head")  # idempotent: create/upgrade/no-op

    with engine.connect() as connection:
        version_after = _current_version(connection)
        report = verify_schema(connection, metadata)

    if not report.ok:
        missing = "; ".join(i.message for i in report.issues)
        raise RuntimeError(f"schema verification failed: {missing}")

    return InitResult(
        already_at_head=version_before == version_after,
        version_before=version_before,
        version_after=version_after,
        tables=sorted(t.name for t in metadata.sorted_tables),
    )
