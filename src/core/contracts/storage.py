"""Artifact storage ports: saving, reading and deleting artifact files."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol, runtime_checkable

from src.core.entities.artifact import Artifact

__all__ = ["ArtifactStorage", "WorkspaceProvider"]


@runtime_checkable
class ArtifactStorage(Protocol):
    """Port for saving, reading and deleting generated artifact files."""

    async def save(
        self,
        artifact: Artifact,
        content: bytes,
    ) -> Artifact:
        ...  # pragma: no cover - protocol

    async def read(self, artifact: Artifact) -> bytes:
        ...  # pragma: no cover - protocol

    async def delete(self, artifact: Artifact) -> None:
        ...  # pragma: no cover - protocol


@runtime_checkable
class WorkspaceProvider(Protocol):
    """Produces an isolated workspace directory for a task."""

    def workspace(self, user_id: str, request_id: str) -> Path:
        """Create and return the task workspace path."""
        ...
