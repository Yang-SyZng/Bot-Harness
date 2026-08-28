"""MySQL persistence plugin: Unit of Work.

``MySQLUnitOfWork`` binds all four repositories to a single SQLAlchemy
``AsyncSession`` so the Application can run a business transaction and commit /
rollback atomically — without ever touching ``AsyncSession`` or MySQL directly.
"""

from __future__ import annotations

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.core.contracts.repositories import UnitOfWork
from src.plugins.persistence.mysql.repositories import (
    MySQLConversationRepository,
    MySQLMessageRepository,
    MySQLTaskRepository,
    MySQLUserRepository,
)

__all__ = ["MySQLUnitOfWork"]


class MySQLUnitOfWork(UnitOfWork):
    """A transactional Unit of Work over the MySQL plugin."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        """Initialize with a session factory for the MySQL backend.

        Args:
            session_factory: An ``async_sessionmaker`` bound to the async engine.
        """
        super().__init__()
        self._session_factory = session_factory
        self._session: AsyncSession | None = None

    async def __aenter__(self) -> "MySQLUnitOfWork":
        self._session = self._session_factory()
        self.users = MySQLUserRepository(self._session)
        self.conversations = MySQLConversationRepository(self._session)
        self.tasks = MySQLTaskRepository(self._session)
        self.messages = MySQLMessageRepository(self._session)
        return self

    async def __aexit__(self, *args: object) -> None:
        try:
            await super().__aexit__(*args)
        finally:
            if self._session is not None:
                await self._session.close()
                self._session = None
            # Drop the repository bindings so a stale session is never reused.
            self.users = None
            self.conversations = None
            self.tasks = None
            self.messages = None

    async def commit(self) -> None:
        """Commit the pending transaction."""
        if self._session is not None:
            try:
                await self._session.commit()
            except SQLAlchemyError:
                await self._session.rollback()
                raise

    async def rollback(self) -> None:
        """Roll back the pending transaction."""
        if self._session is not None:
            await self._session.rollback()
