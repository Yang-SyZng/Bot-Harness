"""Platform-independent value definitions used by Core entities and contracts."""

from __future__ import annotations

import time
import uuid
from enum import StrEnum

__all__ = [
    "AttachmentKind",
    "ActorRefType",
    "MessageEnvelopeDirectionType",
    "MessageEnvelopeTransportFlowType",
    "TaskStatus",
    "BotPlatform",
    "ConversationType",
    "now_ms",
    "new_id",
]


class BotPlatform(StrEnum):
    """The kind of bot platform a connector talks to.

    Extend with concrete platform members as integrations are added; the
    ``UNKNOWN`` placeholder keeps the type non-empty and assignable for now.
    """

    UNKNOWN = "unknown"


class ConversationType(StrEnum):
    DIRECT = "direct"
    GROUP = "group"
    TOPIC = "topic"


class AttachmentKind(StrEnum):
    """The kind of file or media attachment carried by an incoming message."""

    IMAGE = "image"
    FILE = "file"
    AUDIO = "audio"
    VIDEO = "video"


class ActorRefType(StrEnum):
    BOT = "bot"
    PEOPLE = "people"


class MessageEnvelopeDirectionType(StrEnum):
    P2P = "p2p"
    P2B = "p2b"
    B2P = "b2p"
    B2B = "b2b"
    OTHER = "other"


class MessageEnvelopeTransportFlowType(StrEnum):
    INBOUND = "inbound"
    OUTBOUND = "outbound"
    INTERNAL = "internal"


class TaskStatus(StrEnum):
    """Lifecycle states of a task (also used as session state)."""

    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    WAITING_USER = "WAITING_USER"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    TIMED_OUT = "TIMED_OUT"


def now_ms() -> int:
    """Return the current UTC time as a Unix millisecond timestamp.

    Used as the canonical timestamp representation across entities, so time
    values are sortable and comparable without parsing.
    """
    return int(time.time() * 1000)


def new_id() -> str:
    """Return a new random, stable string id (UUID hex, no dashes).

    Core entities use this as their ``id`` default so every instance has a
    stable identity at creation time (referenced by envelope_ids, task_ids,
    parent_session_id, ...) instead of waiting for DB-assigned ids.
    """
    return uuid.uuid4().hex

