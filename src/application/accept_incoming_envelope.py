"""Accept one normalized message in a single transaction, without running AI."""

from collections.abc import Callable
from copy import deepcopy
from dataclasses import dataclass
from typing import Literal

from src.application.session_router import SessionRouter
from src.core.contracts.messaging import NormalizedIncoming
from src.core.contracts.repositories import UnitOfWork
from src.core.entities.agent_run import AgentRun
from src.core.entities.outbox_event import OutboxEvent
from src.core.values import MessageEnvelopeTransportFlowType, SessionStatus, now_ms


@dataclass(frozen=True)
class AcceptanceResult:
    status: Literal["accepted", "duplicate"]
    conversation_id: str
    envelope_id: str
    session_id: str | None
    run_id: str | None


class AcceptIncomingEnvelope:
    def __init__(self, make_uow: Callable[[], UnitOfWork],
                 router: SessionRouter | None = None) -> None:
        self._make_uow = make_uow
        self._router = router or SessionRouter()

    async def execute(self, incoming: NormalizedIncoming) -> AcceptanceResult:
        # Do not leak transaction-local IDs into the caller on rollback/retry.
        envelope = deepcopy(incoming.envelope)
        owner = envelope.sender.external_id if envelope.sender else None
        if not owner or not envelope.idempotency_key or envelope.message is None:
            raise ValueError("sender, idempotency_key and message are required")
        if envelope.transport_flow != MessageEnvelopeTransportFlowType.INBOUND:
            raise ValueError("only inbound envelopes can be accepted")
        if not incoming.address.platform or not (
            incoming.address.room_id or incoming.address.external_id
        ):
            raise ValueError("a platform and conversation address are required")

        async with self._make_uow() as uow:
            # This port serializes callers for the address until commit.
            conversation = await uow.conversations.get_or_create_by_address(incoming.address)
            cid = conversation.id
            envelope.conversation_id = cid
            existing = await uow.envelopes.get_by_idempotency_key(cid, envelope.idempotency_key)
            if existing is None and envelope.transport and envelope.transport.external_message_id:
                existing = await uow.envelopes.get_by_external_message_id(
                    conversation_id=cid,
                    external_message_id=envelope.transport.external_message_id,
                )
            if existing is not None:
                event = await uow.outbox.get_by_envelope(existing.id)
                run = await uow.agent_runs.get(event.run_id) if event else None
                return AcceptanceResult("duplicate", cid, existing.id,
                                        run.session_id if run else None,
                                        run.id if run else None)

            target = None
            if envelope.transport and envelope.transport.external_reply_to_message_id:
                target = await uow.envelopes.get_by_external_message_id(
                    conversation_id=cid,
                    external_message_id=envelope.transport.external_reply_to_message_id,
                )
            elif envelope.reply_to_envelope_id:
                target = await uow.envelopes.get(envelope.reply_to_envelope_id)
            if target and target.conversation_id != cid:
                raise ValueError("reply target belongs to another conversation")
            envelope.reply_to_envelope_id = target.id if target else None

            session = None
            if target:
                for sid in await uow.session_envelopes.list_session_ids(target.id):
                    candidate = await uow.sessions.get(sid)
                    if (candidate and candidate.conversation_id == cid
                            and candidate.owner_user_id == owner and candidate.is_active()):
                        session = candidate
                        break
            if session is None:
                session = await uow.sessions.get_active(conversation_id=cid, owner_user_id=owner)
            route = self._router.route(conversation_id=cid, owner_user_id=owner,
                                       active_session=session)
            if route.action == "create":
                session = self._router.new_session(conversation_id=cid, owner_user_id=owner)
                await uow.sessions.add(session)

            await uow.messages.add(envelope.message)
            await uow.envelopes.add(envelope)
            await uow.session_envelopes.attach(session_id=session.id, envelope_id=envelope.id)
            runs = await uow.agent_runs.list_by_session(session.id)
            run = AgentRun(session_id=session.id,
                           attempt=max((r.attempt for r in runs), default=0) + 1)
            await uow.agent_runs.add(run)
            await uow.outbox.add(OutboxEvent(run_id=run.id, envelope_id=envelope.id))
            if session.status != SessionStatus.RUNNING:
                session.status = SessionStatus.QUEUED
            session.updated_at = now_ms()
            await uow.sessions.save(session)
            conversation.last_message_at = max(conversation.last_message_at or 0,
                                               envelope.received_at or now_ms())
            await uow.conversations.save(conversation)
            result = AcceptanceResult("accepted", cid, envelope.id, session.id, run.id)
        # __aexit__ commits before returning accepted to the platform callback.
        return result
