from __future__ import annotations

from contextlib import contextmanager
from collections.abc import Generator

from sqlalchemy import Connection, Engine, text


class LockNotAcquired(RuntimeError):
    """Raised when a named lock could not be acquired within the timeout."""


@contextmanager
def mysql_named_lock(
    engine: Engine,
    name: str,
    timeout: float = 30.0,
) -> Generator[None, None, None]:
    """Acquire a MySQL named lock for the duration of the with block.

    Args:
        engine: A (sync) SQLAlchemy engine to run the lock statements on.
        name: Lock name (namespace it, e.g. `"kookbot:db:init"`).
        timeout: Seconds to wait for the lock before raising.

    Raises:
        LockNotAcquired: If the lock is not obtained within `timeout`.
        TimeoutError: If `timeout` is negative (kept as a fast-fail guard).
    """
    with engine.connect() as connection:
        acquired = _acquire(connection, name, timeout)
        if not acquired:
            raise LockNotAcquired(
                f"could not acquire MySQL named lock '{name}' within {timeout}s"
            )
        try:
            yield
        finally:
            _release(connection, name)


def _acquire(connection: Connection, name: str, timeout: float) -> bool:
    result = connection.execute(text("SELECT GET_LOCK(:nm, :tm)"), {"nm": name, "tm": timeout})
    value = result.scalar()
    return value == 1


def _release(connection: Connection, name: str) -> None:
    connection.execute(text("SELECT RELEASE_LOCK(:nm)"), {"nm": name})
