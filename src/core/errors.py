"""Core-level error types shared across the application.

These live in Core because they are platform-independent and must be usable by
Application Use Cases, Contract ports and infrastructure plugins alike. They do
not reference any concrete technology.
"""

from __future__ import annotations

__all__ = [
    "DomainError",
    "SessionNotFoundError",
]


class DomainError(Exception):
    """Base class for all Core / domain-level errors."""


class SessionNotFoundError(DomainError):
    """Raised when a session cannot be located by its identifier."""
