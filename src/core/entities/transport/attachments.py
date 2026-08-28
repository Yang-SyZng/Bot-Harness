"""Attachment value object: a file or media attachment on an incoming message.

The attachment is split into two phases of filling:

- On ingress: the platform gives us stable metadata only — the
  id, the kind/type, MIME type, file name and the original network URL. There
  is no local content yet, so size/sha256 are still empty.
- After async download to the working directory: the bytes land on disk; then
  ``fill_from_local`` is called on the target path to fill ``local_path``,
  ``size`` and ``sha256``.

Nothing here persists to SQL — the attachment lives only in the task working
directory for the duration of an exchange.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from pathlib import Path

from src.core.values import AttachmentKind

__all__ = ["Attachment"]

@dataclass
class Attachment:
    """A file or media attachment received from a platform.

    ``id`` is expected to be supplied at ingress (a stable platform id or a
    uuid): every attachment is referenced by it throughout the exchange. The
    content-dependent fields (``local_path``/``size``/``sha256``) are filled
    asynchronously once the file has been downloaded into the working
    directory, via :meth:`fill_from_local`.
    """

    # ── filled on ingress (metadata only, no local content yet) ──
    id: str | None = field(default=None)
    f_type: AttachmentKind | None = None
    name: str | None = None
    mime_type: str | None = None
    source_url: str | None = None

    # ── filled asynchronously after download to the working directory ──
    local_path: str | None = field(default=None)
    size: int | None = field(default=None)
    sha256: str | None = field(default=None)

    def fill_from_local(self, path: Path) -> None:
        """Record the downloaded file and compute its size and sha256.

        Synchronous variant for non-async contexts. The caller is responsible
        for invoking this after the file has been downloaded into the working
        directory (not persisted to SQL). Reads the file once to compute
        ``sha256`` and fills ``local_path`` and ``size``.
        """
        size, sha256 = _digest_path(path)
        self.local_path = str(path)
        self.size = size
        self.sha256 = sha256

    async def afill_from_local(self, path: Path) -> None:
        """Asynchronous variant of :meth:`fill_from_local`.

        Offloads the blocking file read/hash to a worker thread so it does not
        block the event loop. Use this inside an async download coroutine.
        """
        size, sha256 = await asyncio.to_thread(_digest_path, path)
        self.local_path = str(path)
        self.size = size
        self.sha256 = sha256

    @property
    def is_downloaded(self) -> bool:
        """True once the content has been downloaded and hashed."""
        return self.local_path is not None and self.sha256 is not None


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
