"""MySQL repositories for the Conversation/Session domain model."""

from __future__ import annotations

from dataclasses import asdict
from enum import Enum
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.entities.agent_run import AgentRun
from src.core.entities.conversation import Conversation
from src.core.entities.message import Message
from src.core.entities.session import Session
from src.core.entities.session_envelope import SessionEnvelope
from src.core.entities.transport.actor import ActorRef
from src.core.entities.transport.address import ConversationAddress
from src.core.entities.transport.asset import Asset
from src.core.entities.transport.attachments import Attachment
from src.core.entities.transport.connector import Connector
from src.core.entities.transport.envelope import MessageEnvelope
from src.core.entities.transport.transport import TransportRef
from src.core.values import (
    ActorRefType,
    AgentRunStatus,
    AttachmentKind,
    BotPlatform,
    ConversationType,
    MessageEnvelopeDirectionType,
    MessageEnvelopeTransportFlowType,
    MessageRole,
    SessionEnvelopeRole,
    SessionStatus,
    now_ms,
)
from src.plugins.persistence.mysql import models

__all__ = [
    "MySQLConversationRepository",
    "MySQLEnvelopeRepository",
    "MySQLMessageRepository",
    "MySQLSessionRepository",
    "MySQLSessionEnvelopeRepository",
    "MySQLAssetRepository",
    "MySQLAgentRunRepository",
]


def _value(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {key: _value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_value(item) for item in value]
    return value


def _enum(enum_type, value):
    return enum_type(value) if value is not None else None


def _address_json(address: ConversationAddress) -> dict:
    return address.as_mapping()


def _address_key(address: ConversationAddress) -> str:
    return address.identity_key()


def _address_from_json(payload: dict) -> ConversationAddress:
    data = dict(payload or {})
    data["platform"] = _enum(BotPlatform, data.get("platform"))
    return ConversationAddress(**data)


def _attachment_from_json(payload: dict) -> Attachment:
    data = dict(payload)
    data["f_type"] = _enum(AttachmentKind, data.get("f_type"))
    return Attachment(**data)


def _actor_from_json(payload: dict | None) -> ActorRef | None:
    if payload is None:
        return None
    data = dict(payload)
    data["actor_type"] = _enum(ActorRefType, data.get("actor_type"))
    return ActorRef(**data)


def _connector_from_json(payload: dict | None) -> Connector | None:
    if payload is None:
        return None
    data = dict(payload)
    data["platform"] = _enum(BotPlatform, data.get("platform"))
    return Connector(**data)


def _message_from_row(row: models.Message) -> Message:
    return Message(
        id=row.id,
        role=_enum(MessageRole, row.role),
        content=row.content,
        attachments=[
            _attachment_from_json(item) for item in (row.attachments_json or [])
        ],
    )


def _conversation_from_row(row: models.Conversation) -> Conversation:
    return Conversation(
        id=row.id,
        address=_address_from_json(row.address_json),
        conversation_type=_enum(ConversationType, row.conversation_type),
        parent_id=row.parent_id,
        created_at=row.created_at,
        last_message_at=row.last_message_at,
    )


def _session_from_row(row: models.Session) -> Session:
    return Session(
        id=row.id,
        conversation_id=row.conversation_id,
        owner_user_id=row.owner_user_id,
        parent_session_id=row.parent_session_id,
        covers_through_envelope_id=row.covers_through_envelope_id,
        goal=row.goal,
        status=_enum(SessionStatus, row.status),
        summary=row.summary,
        idempotency_key=row.idempotency_key,
        version=row.version,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _asset_from_row(row: models.Asset) -> Asset:
    return Asset(
        id=row.id,
        original_name=row.original_name,
        mime_type=row.mime_type,
        size=row.size,
        sha256=row.sha256,
        source=row.source,
        storage_key=row.storage_key,
        local_path=None,
        safe_to_share=row.safe_to_share,
        status=row.status,
        created_at=row.created_at,
    )


def _run_from_row(row: models.AgentRun) -> AgentRun:
    return AgentRun(
        id=row.id,
        session_id=row.session_id,
        attempt=row.attempt,
        status=AgentRunStatus(row.status),
        backend=row.backend,
        model=row.model,
        worker_id=row.worker_id,
        started_at=row.started_at,
        completed_at=row.completed_at,
    )


class MySQLConversationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, conversation: Conversation) -> None:
        if conversation.address is None:
            raise ValueError("conversation address is required")
        self._session.add(
            models.Conversation(
                id=conversation.id,
                address_key=_address_key(conversation.address),
                address_json=_address_json(conversation.address),
                conversation_type=_value(conversation.conversation_type),
                parent_id=conversation.parent_id,
                created_at=conversation.created_at,
                last_message_at=conversation.last_message_at,
            )
        )
        await self._session.flush()

    async def get(self, conversation_id: str) -> Conversation | None:
        row = await self._session.get(models.Conversation, conversation_id)
        return _conversation_from_row(row) if row is not None else None

    async def get_or_create_by_address(
        self, address: ConversationAddress
    ) -> Conversation:
        key = _address_key(address)
        row = (
            await self._session.execute(
                select(models.Conversation).where(
                    models.Conversation.address_key == key
                )
            )
        ).scalar_one_or_none()
        if row is not None:
            return _conversation_from_row(row)
        conversation = Conversation(address=address)
        await self.add(conversation)
        return conversation

    async def save(self, conversation: Conversation) -> None:
        row = await self._session.get(models.Conversation, conversation.id)
        if row is None:
            await self.add(conversation)
            return
        if conversation.address is None:
            raise ValueError("conversation address is required")
        row.address_key = _address_key(conversation.address)
        row.address_json = _address_json(conversation.address)
        row.conversation_type = _value(conversation.conversation_type)
        row.parent_id = conversation.parent_id
        row.created_at = conversation.created_at
        row.last_message_at = conversation.last_message_at


class MySQLMessageRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, message: Message) -> None:
        if await self._session.get(models.Message, message.id) is not None:
            return
        self._session.add(
            models.Message(
                id=message.id,
                role=_value(message.role),
                content=message.content,
                attachments_json=_value(
                    [asdict(item) for item in (message.attachments or [])]
                ),
            )
        )
        await self._session.flush()

    async def get(self, message_id: str) -> Message | None:
        row = await self._session.get(models.Message, message_id)
        return _message_from_row(row) if row is not None else None


class MySQLEnvelopeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, envelope: MessageEnvelope) -> None:
        if envelope.conversation_id is None:
            raise ValueError("envelope conversation_id is required")
        if await self._session.get(models.MessageEnvelope, envelope.id) is not None:
            return
        if envelope.message is not None:
            await MySQLMessageRepository(self._session).add(envelope.message)
        self._session.add(
            models.MessageEnvelope(
                id=envelope.id,
                version=envelope.version,
                conversation_id=envelope.conversation_id,
                message_id=envelope.message.id if envelope.message else None,
                sender_json=_value(asdict(envelope.sender)) if envelope.sender else None,
                recipient_json=(
                    _value(asdict(envelope.recipient)) if envelope.recipient else None
                ),
                connector_json=(
                    _value(asdict(envelope.transport.connector_id))
                    if envelope.transport and envelope.transport.connector_id
                    else None
                ),
                external_event_id=(
                    envelope.transport.external_event_id
                    if envelope.transport else None
                ),
                external_message_id=(
                    envelope.transport.external_message_id
                    if envelope.transport else None
                ),
                external_reply_to_message_id=(
                    envelope.transport.external_reply_to_message_id
                    if envelope.transport else None
                ),
                reply_to_envelope_id=envelope.reply_to_envelope_id,
                direction=_value(envelope.direction),
                transport_flow=_value(envelope.transport_flow),
                occurred_at=envelope.occurred_at,
                received_at=envelope.received_at,
                idempotency_key=envelope.idempotency_key,
            )
        )
        await self._session.flush()

    async def _from_row(self, row: models.MessageEnvelope) -> MessageEnvelope:
        message = None
        if row.message_id is not None:
            message_row = await self._session.get(models.Message, row.message_id)
            if message_row is not None:
                message = _message_from_row(message_row)
        connector = _connector_from_json(row.connector_json)
        transport = None
        if any(
            (
                connector,
                row.external_event_id,
                row.external_message_id,
                row.external_reply_to_message_id,
            )
        ):
            transport = TransportRef(
                connector_id=connector,
                external_event_id=row.external_event_id,
                external_message_id=row.external_message_id,
                external_reply_to_message_id=row.external_reply_to_message_id,
            )
        return MessageEnvelope(
            id=row.id,
            version=row.version,
            conversation_id=row.conversation_id,
            message=message,
            sender=_actor_from_json(row.sender_json),
            recipient=_actor_from_json(row.recipient_json),
            reply_to_envelope_id=row.reply_to_envelope_id,
            transport=transport,
            direction=_enum(MessageEnvelopeDirectionType, row.direction),
            transport_flow=_enum(
                MessageEnvelopeTransportFlowType, row.transport_flow
            ),
            occurred_at=row.occurred_at,
            received_at=row.received_at,
            idempotency_key=row.idempotency_key,
        )

    async def get(self, envelope_id: str) -> MessageEnvelope | None:
        row = await self._session.get(models.MessageEnvelope, envelope_id)
        return await self._from_row(row) if row is not None else None

    async def get_by_external_message_id(
        self,
        *,
        conversation_id: str,
        external_message_id: str,
    ) -> MessageEnvelope | None:
        row = (
            await self._session.execute(
                select(models.MessageEnvelope).where(
                    models.MessageEnvelope.conversation_id == conversation_id,
                    models.MessageEnvelope.external_message_id
                    == external_message_id,
                )
            )
        ).scalar_one_or_none()
        return await self._from_row(row) if row is not None else None

    async def list_by_conversation(
        self,
        conversation_id: str,
        *,
        after_envelope_id: str | None = None,
        limit: int | None = None,
    ) -> list[MessageEnvelope]:
        rows = (
            await self._session.execute(
                select(models.MessageEnvelope)
                .where(models.MessageEnvelope.conversation_id == conversation_id)
                .order_by(
                    models.MessageEnvelope.received_at,
                    models.MessageEnvelope.id,
                )
            )
        ).scalars().all()
        if after_envelope_id is not None:
            for index, row in enumerate(rows):
                if row.id == after_envelope_id:
                    rows = rows[index + 1 :]
                    break
            else:
                rows = []
        if limit is not None:
            rows = rows[-limit:]
        return [await self._from_row(row) for row in rows]


class MySQLSessionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, session: Session) -> None:
        self._session.add(
            models.Session(
                id=session.id,
                conversation_id=session.conversation_id,
                owner_user_id=session.owner_user_id,
                parent_session_id=session.parent_session_id,
                covers_through_envelope_id=session.covers_through_envelope_id,
                goal=session.goal,
                status=_value(session.status),
                summary=session.summary,
                idempotency_key=session.idempotency_key,
                version=session.version,
                created_at=session.created_at,
                updated_at=session.updated_at,
            )
        )
        await self._session.flush()

    async def get(self, session_id: str) -> Session | None:
        row = await self._session.get(models.Session, session_id)
        return _session_from_row(row) if row is not None else None

    async def save(self, session: Session) -> None:
        row = await self._session.get(models.Session, session.id)
        if row is None:
            await self.add(session)
            return
        row.parent_session_id = session.parent_session_id
        row.covers_through_envelope_id = session.covers_through_envelope_id
        row.goal = session.goal
        row.status = _value(session.status)
        row.summary = session.summary
        row.idempotency_key = session.idempotency_key
        row.version = session.version
        row.updated_at = session.updated_at

    async def get_active(
        self,
        *,
        conversation_id: str,
        owner_user_id: str | None = None,
    ) -> Session | None:
        stmt = select(models.Session).where(
            models.Session.conversation_id == conversation_id,
            models.Session.status.in_(
                [
                    SessionStatus.QUEUED.value,
                    SessionStatus.RUNNING.value,
                    SessionStatus.WAITING_USER.value,
                ]
            ),
        )
        if owner_user_id is not None:
            stmt = stmt.where(models.Session.owner_user_id == owner_user_id)
        row = (
            await self._session.execute(
                stmt.order_by(models.Session.updated_at.desc(), models.Session.id.desc())
            )
        ).scalars().first()
        return _session_from_row(row) if row is not None else None

    async def list_by_conversation(self, conversation_id: str) -> list[Session]:
        rows = (
            await self._session.execute(
                select(models.Session)
                .where(models.Session.conversation_id == conversation_id)
                .order_by(models.Session.created_at, models.Session.id)
            )
        ).scalars().all()
        return [_session_from_row(row) for row in rows]


class MySQLSessionEnvelopeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def attach(
        self,
        *,
        session_id: str,
        envelope_id: str,
        relation_role: SessionEnvelopeRole = SessionEnvelopeRole.INPUT,
    ) -> SessionEnvelope:
        key = {"session_id": session_id, "envelope_id": envelope_id}
        existing = await self._session.get(models.SessionEnvelope, key)
        if existing is not None:
            return self._from_row(existing)

        session = await self._session.get(models.Session, session_id)
        envelope = await self._session.get(models.MessageEnvelope, envelope_id)
        if session is None:
            raise ValueError(f"unknown session: {session_id}")
        if envelope is None:
            raise ValueError(f"unknown envelope: {envelope_id}")
        if session.conversation_id != envelope.conversation_id:
            raise ValueError("session and envelope belong to different conversations")

        maximum = await self._session.scalar(
            select(func.max(models.SessionEnvelope.sequence_no)).where(
                models.SessionEnvelope.session_id == session_id
            )
        )
        row = models.SessionEnvelope(
            session_id=session_id,
            envelope_id=envelope_id,
            sequence_no=(maximum or 0) + 1,
            relation_role=relation_role.value,
            created_at=now_ms(),
        )
        self._session.add(row)
        await self._session.flush()
        return self._from_row(row)

    @staticmethod
    def _from_row(row: models.SessionEnvelope) -> SessionEnvelope:
        return SessionEnvelope(
            session_id=row.session_id,
            envelope_id=row.envelope_id,
            sequence_no=row.sequence_no,
            relation_role=SessionEnvelopeRole(row.relation_role),
            created_at=row.created_at,
        )

    async def list_by_session(self, session_id: str) -> list[SessionEnvelope]:
        rows = (
            await self._session.execute(
                select(models.SessionEnvelope)
                .where(models.SessionEnvelope.session_id == session_id)
                .order_by(models.SessionEnvelope.sequence_no)
            )
        ).scalars().all()
        return [self._from_row(row) for row in rows]

    async def list_session_ids(self, envelope_id: str) -> list[str]:
        rows = (
            await self._session.execute(
                select(models.SessionEnvelope)
                .where(models.SessionEnvelope.envelope_id == envelope_id)
                .order_by(models.SessionEnvelope.created_at, models.SessionEnvelope.session_id)
            )
        ).scalars().all()
        return [row.session_id for row in rows]


class MySQLAssetRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, asset: Asset) -> None:
        self._session.add(
            models.Asset(
                id=asset.id,
                original_name=asset.original_name,
                mime_type=asset.mime_type,
                size=asset.size,
                sha256=asset.sha256,
                source=asset.source,
                storage_key=asset.storage_key,
                safe_to_share=asset.safe_to_share,
                status=asset.status,
                created_at=asset.created_at,
            )
        )
        await self._session.flush()

    async def get(self, asset_id: str) -> Asset | None:
        row = await self._session.get(models.Asset, asset_id)
        return _asset_from_row(row) if row is not None else None

    async def list_by_sha256(self, sha256: str) -> list[Asset]:
        rows = (
            await self._session.execute(
                select(models.Asset).where(models.Asset.sha256 == sha256)
            )
        ).scalars().all()
        return [_asset_from_row(row) for row in rows]


class MySQLAgentRunRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, run: AgentRun) -> None:
        if run.session_id is None:
            raise ValueError("agent run session_id is required")
        self._session.add(
            models.AgentRun(
                id=run.id,
                session_id=run.session_id,
                attempt=run.attempt,
                status=run.status.value,
                backend=run.backend,
                model=run.model,
                worker_id=run.worker_id,
                started_at=run.started_at,
                completed_at=run.completed_at,
            )
        )
        await self._session.flush()

    async def get(self, run_id: str) -> AgentRun | None:
        row = await self._session.get(models.AgentRun, run_id)
        return _run_from_row(row) if row is not None else None

    async def save(self, run: AgentRun) -> None:
        row = await self._session.get(models.AgentRun, run.id)
        if row is None:
            await self.add(run)
            return
        row.status = run.status.value
        row.backend = run.backend
        row.model = run.model
        row.worker_id = run.worker_id
        row.started_at = run.started_at
        row.completed_at = run.completed_at

    async def list_by_session(self, session_id: str) -> list[AgentRun]:
        rows = (
            await self._session.execute(
                select(models.AgentRun)
                .where(models.AgentRun.session_id == session_id)
                .order_by(models.AgentRun.attempt)
            )
        ).scalars().all()
        return [_run_from_row(row) for row in rows]
