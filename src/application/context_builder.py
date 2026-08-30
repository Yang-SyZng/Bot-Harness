"""ContextBuilder: assemble an AI context from session inputs.

This layer builds a structured, ordered AI context from already-resolved
inputs (the session goal, resolved conversation messages, an optional snapshot
summary and the current user message). Pulling messages/snapshots from storage
is left to a repository port and is out of scope here; this class only does
the pure assembly, ordering and budget trimming that can be unit-tested.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

__all__ = ["ContextMessage", "ContextPiece", "AgentContext", "ContextBuilder"]

# Rough token estimate: ~4 chars per token (English-heavy approximation).
_CHARS_PER_TOKEN = 4


@dataclass(frozen=True)
class ContextMessage:
    """A single resolved conversation message to place in the context."""

    role: Literal["user", "assistant"]
    content: str


@dataclass(frozen=True)
class ContextPiece:
    """One segment of the built AI context."""

    source: str  # "goal" | "snapshot" | "message" | "current"
    role: str
    content: str


@dataclass(frozen=True)
class AgentContext:
    """The assembled AI context."""

    goal: str | None
    pieces: list[ContextPiece]
    token_estimate: int
    truncated: bool


class ContextBuilder:
    """Order and trim inputs into an AI context."""

    def build(
        self,
        *,
        goal: str | None = None,
        snapshot_summary: str | None = None,
        messages: list[ContextMessage] | None = None,
        current: str | None = None,
        token_budget: int | None = None,
    ) -> AgentContext:
        """Assemble the context in order: goal -> snapshot -> messages -> current.

        If ``token_budget`` is given and the assembled context exceeds it,
        trailing messages are dropped and the result is marked ``truncated``
        (snapshot/current are kept so the newest state survives).
        """
        pieces: list[ContextPiece] = []
        if goal:
            pieces.append(ContextPiece(source="goal", role="system", content=goal))
        if snapshot_summary:
            pieces.append(
                ContextPiece(source="snapshot", role="system", content=snapshot_summary)
            )
        for msg in messages or []:
            pieces.append(
                ContextPiece(source="message", role=msg.role, content=msg.content)
            )
        if current:
            pieces.append(ContextPiece(source="current", role="user", content=current))

        estimated = sum(len(p.content) // _CHARS_PER_TOKEN for p in pieces)
        truncated = False

        if token_budget is not None and estimated > token_budget:
            truncated = True
            # Drop trailing message pieces until within budget or none left.
            while estimated > token_budget:
                removed: ContextPiece | None = None
                for i in range(len(pieces) - 1, 0, -1):
                    if pieces[i].source == "message":
                        removed = pieces.pop(i)
                        break
                if removed is None:
                    break
                estimated = sum(len(p.content) // _CHARS_PER_TOKEN for p in pieces)

        return AgentContext(
            goal=goal,
            pieces=pieces,
            token_estimate=estimated,
            truncated=truncated,
        )
