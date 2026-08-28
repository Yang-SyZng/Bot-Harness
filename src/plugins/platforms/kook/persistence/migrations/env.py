"""Alembic environment for the kook platform persistence schema.

The migration target is the kook platform metadata
(``plugins.platforms.kook.persistence``), the connection URL is resolved at
runtime from ``AppSettings`` (via the MySQL plugin database framework), and
migrations run against an async engine so the whole stack stays async
(SQLAlchemy 2.x + aiosqlalchemy.aiomysql).
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# this is the Alembic Config object, which provides access to the values within
# the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# KOOK adapter models: import the package so every model is registered on
# Base.metadata, then point Alembic at that metadata.
from src.plugins.platforms.kook.persistence import metadata as target_metadata  # noqa: E402

# Runtime connection URL built from AppSettings, falling back to the ini value.
from src.plugins.persistence.mysql.database.engine import build_database_url  # noqa: E402
from src import global_settings as settings  # noqa: E402

_runtime_url = build_database_url(
    host=settings.sql_host,
    port=settings.sql_port,
    user=settings.sql_user,
    password=settings.sql_passwd,
    database=settings.sql_database,
)
config.set_main_option("sqlalchemy.url", _runtime_url)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL and not an Engine, though an
    Engine is acceptable here as well. By skipping the Engine creation we don't
    even need a DBAPI to be available.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Configure the migration context against a live connection."""
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations against an async engine."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (wraps the async runner)."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
