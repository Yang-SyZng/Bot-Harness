"""Artifact storage ports: saving, reading and deleting artifact files."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol, runtime_checkable

from src.core.entities.transport.asset import Asset

__all__ = ["ArtifactStorage", "WorkspaceProvider"]


@runtime_checkable
class ArtifactStorage(Protocol):
    """Port for saving, reading and deleting generated asset files."""

    async def save(
        self,
        asset: Asset,
        content: bytes,
    ) -> Asset:
        ...  # pragma: no cover - protocol

    async def read(self, asset: Asset) -> bytes:
        ...  # pragma: no cover - protocol

    async def delete(self, asset: Asset) -> None:
        ...  # pragma: no cover - protocol


@runtime_checkable
class WorkspaceProvider(Protocol):
    """Produces an isolated workspace directory for a task."""

    def workspace(self, user_id: str, request_id: str) -> Path:
        """Create and return the task workspace path."""
        ...
