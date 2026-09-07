"""Durable request to execute a run after the inbound transaction commits."""

from dataclasses import dataclass, field

from src.core.values import new_id, now_ms


@dataclass(frozen=True)
class OutboxEvent:
    run_id: str
    envelope_id: str
    id: str = field(default_factory=new_id)
    event_type: str = "agent_run.requested"
    created_at: int = field(default_factory=now_ms)
    published_at: int | None = None
