"""AssetStore: register and track generated assets in a session workspace.

Moved into the agent module (replacing the former standalone ``src/artifacts``
package, which was a single artifact-only file). It now registers unified
:class:`Asset` records (computed size/sha256) into a workspace ``assets.json``
manifest, decoupled from the removed ``Artifact`` entity.
"""

from __future__ import annotations

import json
from dataclasses import asdict, is_dataclass
from pathlib import Path

from src.core.entities.transport.asset import Asset

__all__ = ["AssetStore"]


class AssetStore:
    """Register and track generated assets within a session workspace."""

    def __init__(
        self,
        workspace: Path,
        max_bytes: int = 10 * 1024 * 1024,
    ) -> None:
        """Initialize the asset store.

        Args:
            workspace: Session workspace containing the output directory.
            max_bytes: Maximum allowed size of each asset in bytes.
        """
        self._workspace = workspace.resolve()
        self._output = self._workspace / "output"
        self._output.mkdir(parents=True, exist_ok=True)
        self._manifest = self._workspace / "assets.json"
        self._max_bytes = max_bytes
        self._assets: list[Asset] = []

    def register(
        self,
        path: Path,
        *,
        name: str,
        mime_type: str,
        safe_to_share: bool = False,
    ) -> Asset:
        """Validate, register, and persist metadata for a generated asset.

        Args:
            path: Path to the asset file in the workspace output directory.
            name: Safe filename used to identify the asset.
            mime_type: MIME type of the asset.
            safe_to_share: Whether the asset may be shared with the user.

        Returns:
            The registered asset metadata.

        Raises:
            ValueError: If the asset does not exist, is outside the output
                directory, has an unsafe name, or exceeds the size limit.
        """
        resolved = path.resolve()
        if not resolved.is_file():
            raise ValueError("The asset file does not exist.")
        if resolved.parent != self._output:
            raise ValueError(
                "The asset file must be placed in the current session's "
                "'output' directory."
            )
        safe_name = Path(name).name
        if safe_name != name or not safe_name:
            raise ValueError("Asset name is not safe")
        if resolved.stat().st_size > self._max_bytes:
            raise ValueError("The asset exceeds the size limit.")

        asset = Asset.from_local(
            resolved,
            name=safe_name,
            mime_type=mime_type,
            source="agent_generated",
            safe_to_share=safe_to_share,
        )
        self._assets.append(asset)

        temporary = self._manifest.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(
                [_asset_to_json(item) for item in self._assets],
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        temporary.replace(self._manifest)
        return asset

    def list(self) -> list[Asset]:
        """Return a copy of the registered assets."""
        return list(self._assets)


def _asset_to_json(asset: Asset) -> dict:
    """Serialize an Asset into a JSON-ready dict.

    Bare ``dataclasses.asdict`` is insufficient because it leaves ``None`` /
    enums / nested values that ``json.dumps`` cannot encode; convert them.
    """
    payload: dict = asdict(asset)

    def _convert(value: object) -> object:
        if isinstance(value, Path):
            return str(value)
        if isinstance(value, dict):
            return {k: _convert(v) for k, v in value.items()}
        if isinstance(value, (list, tuple)):
            return [_convert(v) for v in value]
        if is_dataclass(value) and not isinstance(value, type):
            return _convert(asdict(value))
        if hasattr(value, "value"):
            return value.value
        return value

    return _convert(payload)
