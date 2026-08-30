"""Asset entity: the unified persisted-file descriptor.

Per the design, ``Attachment`` (inbound description) and ``Artifact``
(agent-output description) are distinct stage value objects, but both land in
an ``Asset`` — the unified "downloaded or generated" file. This entity carries
the storage metadata (source, mime, size, sha256, storage key); the file body
stays in the workspace / object storage, not on the entity.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from src.core.values import now_ms

__all__ = ["Asset"]


def _digest_path(path: Path) -> tuple[int, str]:
    """Return ``(size, sha256-hex)`` for the file at ``path``."""
    import hashlib

    digest = hashlib.sha256()
    size = 0
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
            size += len(chunk)
    return size, digest.hexdigest()


@dataclass
class Asset:
    """A downloaded or generated file, registered once.

    ``local_path`` is the working-directory location used for the current task
    (never persisted into a database as an absolute path). ``storage_key`` is
    the placeholder for a stable object-storage key in a later phase.
    """

    # ── identity / ownership ──
    id: str | None = field(default=None)

    # ── storage metadata ──
    original_name: str | None = field(default=None)
    mime_type: str | None = field(default=None)
    size: int | None = field(default=None)
    sha256: str | None = field(default=None)
    source: str = field(default="agent_generated")  # user_upload / agent_generated / ...
    storage_key: str | None = field(default=None)
    local_path: str | None = field(default=None)

    # ── sharing / lifecycle ──
    safe_to_share: bool = field(default=False)
    status: str = field(default="ready")

    created_at: int | None = field(default=None)

    @property
    def name(self) -> str | None:
        """Backwards-compatible alias for ``original_name``."""
        return self.original_name

    @classmethod
    def from_local(
        cls,
        path: Path,
        *,
        name: str,
        mime_type: str,
        source: str = "agent_generated",
        safe_to_share: bool = False,
    ) -> "Asset":
        """Build an Asset from a file already on disk, computing size and sha256."""
        size, sha256 = _digest_path(path)
        return cls(
            original_name=name,
            mime_type=mime_type,
            size=size,
            sha256=sha256,
            source=source,
            local_path=str(path),
            safe_to_share=safe_to_share,
            created_at=now_ms(),
        )
