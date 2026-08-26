"""Platform-independent value definitions used by Core entities and contracts."""

from __future__ import annotations

from enum import StrEnum

__all__ = [
    "AttachmentKind",
    "TaskStatus",
]


class AttachmentKind(StrEnum):
    """The kind of file or media attachment carried by an incoming message."""

    IMAGE = "image"
    FILE = "file"
    AUDIO = "audio"
    VIDEO = "video"


class TaskStatus(StrEnum):
    """Lifecycle states of a task."""

    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    WAITING_USER = "WAITING_USER"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    TIMED_OUT = "TIMED_OUT"
