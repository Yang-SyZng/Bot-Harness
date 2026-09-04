"""Ordered many-to-many relation between Sessions and MessageEnvelopes."""

from __future__ import annotations

from dataclasses import dataclass

from src.core.values import SessionEnvelopeRole

__all__ = ["SessionEnvelope"]


@dataclass(frozen=True)
class SessionEnvelope:
    """One ordered Envelope reference selected for a Session."""

    session_id: str
    envelope_id: str
    sequence_no: int
    relation_role: SessionEnvelopeRole = SessionEnvelopeRole.INPUT
    created_at: int | None = None
