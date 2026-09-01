"""Result publisher port.

A ``ResultPublisher`` sends a rendered result back to an external platform. The
platform-specific renderer is one implementation; other platforms plug in the
same way.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

from src.core.entities.transport.asset import Asset

__all__ = ["ReplyDestination", "PublishedResult", "ResultPublisher"]


@dataclass
class ReplyDestination:
    """Platform-neutral address identifying where a reply should be sent."""

    platform: str
    channel_id: str
    # Original message id, when the reply targets a specific message.
    reply_to_message_id: str | None = None
    # Optional free-form platform payload the publisher understands.
    provider_data: dict = field(default_factory=dict)


@dataclass
class PublishedResult:
    """The unified result a publisher turns into a platform message."""

    text: str | None = None
    artifacts: list[Asset] = field(default_factory=list)
    done: bool = True


@runtime_checkable
class ResultPublisher(Protocol):
    """Port implemented by platform renderers/publishers."""

    async def publish(
        self,
        destination: ReplyDestination,
        result: PublishedResult,
    ) -> None:
        """Send ``result`` to ``destination``."""
        ...
