from __future__ import annotations

from dataclasses import dataclass, field

from src.core.entities.transport.connector import Connector

__all__ = ["TransportRef"]


@dataclass
class TransportRef:
    connector_id: Connector | None = field(default=None)
    external_event_id: str | None = field(default=None)
    external_message_id: str | None = field(default=None)
