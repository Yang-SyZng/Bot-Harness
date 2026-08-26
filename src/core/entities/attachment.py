"""Attachment value object: a file or media attachment on an incoming message."""

from __future__ import annotations

from dataclasses import dataclass, field

from src.core.values import AttachmentKind

__all__ = ["Attachment"]


@dataclass
class Attachment:
    """Describe a file or media attachment received from a platform."""

    url: str
    name: str | None = None
    mime_type: str | None = None
    kind: AttachmentKind | str = AttachmentKind.FILE
