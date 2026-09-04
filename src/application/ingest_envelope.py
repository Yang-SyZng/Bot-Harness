"""Inbound envelope ingestion.

Turns a platform-normalized ``MessageEnvelope`` into persisted conversation
state: locate/create the ``Conversation`` by its address, fill
``conversation_id``, persist the envelope, and route it onto a session.

The repository/UnitOfWork set is injected (as a factory returning a fresh
``UnitOfWork``) so the same use case runs on Fake or MySQL plugins.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

from src.application.session_router import SessionRouter
from src.core.contracts.repositories import UnitOfWork
from src.core.entities.transport.address import ConversationAddress
from src.core.entities.transport.envelope import MessageEnvelope
from src.core.values import SessionStatus

log = logging.getLogger(__name__)

__all__ = ["IngestEnvelope"]

MakeUOW = Callable[[], UnitOfWork]


class IngestEnvelope:
    """Persist and route an inbound envelope into conversation/session state."""

    def __init__(self, make_uow: MakeUOW, router: SessionRouter | None = None) -> None:
        """Initialize the ingest use case.

        Args:
            make_uow: Callable returning a fresh ``UnitOfWork`` (used with
                ``async with``).
            router: Session router deciding join/seed. A default is created
                if omitted.
        """
        self._make_uow = make_uow
        self._router = router or SessionRouter()

    async def ensure_conversation(
        self, address: ConversationAddress
    ) -> str:
        """Locate/create the conversation for ``address`` and return its id.

        Conversation lookup/creation happens here (at the point of entry) and is
        recorded once on the Conversation (single address source); envelopes only
        carry the resolved ``conversation_id`` after that.
        """
        async with self._make_uow() as uow:
            conversation = await uow.conversations.get_or_create_by_address(address)
            cid = conversation.id
            await uow.commit()
        assert cid is not None
        return str(cid)

    async def handle(self, envelope: MessageEnvelope) -> None:
        """Persist ``envelope`` under its (already resolved) conversation.

        ``envelope.conversation_id`` is expected to have been filled by the entry
        point (via :meth:`ensure_conversation`). Envelopes without a resolved
        conversation are skipped.
        """
        cid = envelope.conversation_id
        if cid is None:
            log.warning("envelope %s has no conversation_id; skipped", envelope.id)
            return

        async with self._make_uow() as uow:
            conversation = await uow.conversations.get(cid)
            if conversation is None:
                log.warning("conversation %s not found for envelope %s", cid, envelope.id)
                return

            user_id = None
            if envelope.sender is not None:
                user_id = envelope.sender.external_id

            external_reply_id = None
            if envelope.transport is not None:
                external_reply_id = envelope.transport.external_reply_to_message_id
            if external_reply_id is not None:
                reply_target = await uow.envelopes.get_by_external_message_id(
                    conversation_id=cid,
                    external_message_id=external_reply_id,
                )
                if reply_target is not None:
                    envelope.reply_to_envelope_id = reply_target.id

            if envelope.message is not None:
                await uow.messages.add(envelope.message)
            await uow.envelopes.add(envelope)

            active = await uow.sessions.get_active(
                conversation_id=cid,
                owner_user_id=user_id,
            )
            route = self._router.route(
                conversation_id=cid,
                owner_user_id=user_id or "",
                active_session=active,
            )
            if route.action == "create":
                session = self._router.new_session(
                    conversation_id=cid,
                    owner_user_id=user_id or "",
                    # Session goal extraction is not yet implemented.
                    goal=None,
                )
                session.status = SessionStatus.WAITING_USER
                await uow.sessions.add(session)
                await uow.session_envelopes.attach(
                    session_id=session.id,
                    envelope_id=envelope.id,
                )
            elif active is not None:
                await uow.session_envelopes.attach(
                    session_id=active.id,
                    envelope_id=envelope.id,
                )

            await uow.commit()
