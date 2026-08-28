from __future__ import annotations

from urllib.parse import quote_plus

from sqlalchemy import Engine, create_engine
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from src import AppSettings, global_settings

_MYSQL_DRIVER = "mysql+aiomysql"


def build_database_url(
    *,
    host: str,
    port: int,
    user: str,
    password: str,
    database: str,
    driver: str = _MYSQL_DRIVER,
) -> str:
    """Assemble a MySQL DSN for the given SQLAlchemy driver.

    Args:
        host: MySQL host.
        port: MySQL TCP port.
        user: Login user.
        password: Login password (URL-encoded).
        database: Target database name.
        driver: SQLAlchemy MySQL driver (e.g. `mysql+aiomysql` or
            `mysql+pymysql`).

    Returns:
        A `mysql+<driver>://...` DSN string.
    """
    return (
        f"{driver}://{quote_plus(user)}:{quote_plus(password)}"
        f"@{host}:{port}/{quote_plus(database)}?charset=utf8mb4"
    )


def create_engine_from_settings(settings: AppSettings | None = None) -> AsyncEngine:
    """Create an `AsyncEngine` configured from application settings.

    Args:
        settings: Settings to source connection params from. Defaults to the
            module-level `global_settings` singleton.

    Returns:
        A lazily-connecting SQLAlchemy async engine.
    """
    s = settings or global_settings
    url = _url_from_settings(s)
    return create_async_engine(url, pool_pre_ping=True)


def _url_from_settings(s: AppSettings, driver: str = _MYSQL_DRIVER) -> str:
    """Build a DSN string from application settings."""
    return build_database_url(
        host=s.sql_host,
        port=s.sql_port,
        user=s.sql_user,
        password=s.sql_passwd,
        database=s.sql_database,
        driver=driver,
    )


def create_sync_engine_from_settings(
    settings: AppSettings | None = None,
) -> Engine:
    """Create a **sync** `Engine` from application settings (PyMySQL).

    Used for startup-time initialization and schema verification where a plain
    blocking engine is simpler than an async one (no running event loop yet).
    """
    s = settings or global_settings
    url = _url_from_settings(s, driver="mysql+pymysql")
    return create_engine(url, pool_pre_ping=True)


class Database:
    """Common async engine/session container used across the application."""

    def __init__(self, engine: AsyncEngine) -> None:
        """Store the engine and derive its session factory."""
        self.engine = engine
        self.session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
            engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )

    def session(self) -> async_sessionmaker[AsyncSession]:
        """Return the session factory bound to this database (alias)."""
        return self.session_factory

    async def dispose(self) -> None:
        """Close the underlying engine connection pool."""
        await self.engine.dispose()

    @classmethod
    def from_settings(cls, settings: AppSettings | None = None) -> "Database":
        """Build a :class:`Database` from application settings."""
        return cls(create_engine_from_settings(settings))
