"""Fernet helpers for Auth Profile secrets.

Normal runtime encryption/decryption uses TESTFLOW_SECRET_KEY only.  The legacy
service-role-derived key is exposed only to the explicit one-time re-key tool so
rotating Supabase credentials cannot silently make Auth Profiles unreadable.
"""

import base64
import hashlib
import json
import os
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


class SecretUnavailableError(RuntimeError):
    """Raised when the dedicated Auth Profile key is unavailable or invalid."""


def _explicit_fernet() -> Fernet:
    material = (os.environ.get("TESTFLOW_SECRET_KEY") or "").strip()
    if not material:
        raise SecretUnavailableError(
            "TESTFLOW_SECRET_KEY is required for Auth Profile encryption. "
            "Configure one stable Fernet key before using Auth Profiles."
        )
    try:
        return Fernet(material.encode("utf-8"))
    except Exception as exc:
        raise SecretUnavailableError(
            "TESTFLOW_SECRET_KEY must be a valid Fernet key."
        ) from exc


def _legacy_fernet() -> Fernet:
    """Legacy reader used only by the explicit re-key migration utility."""
    material = (settings.SUPABASE_SERVICE_ROLE_KEY or "").strip()
    if not material:
        raise SecretUnavailableError("Legacy key material is unavailable.")
    digest = hashlib.sha256(material.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def is_configured() -> bool:
    try:
        _explicit_fernet()
        return True
    except SecretUnavailableError:
        return False


def encrypt_mapping(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return _explicit_fernet().encrypt(raw).decode("utf-8")


def _decode(token: str, fernet: Fernet) -> Optional[dict]:
    if not token:
        return None
    try:
        raw = fernet.decrypt(token.encode("utf-8"))
        value = json.loads(raw.decode("utf-8"))
    except (InvalidToken, ValueError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def decrypt_mapping(token: str) -> Optional[dict]:
    """Decrypt runtime data with the dedicated key only."""
    if not token:
        return None
    try:
        return _decode(token, _explicit_fernet())
    except SecretUnavailableError:
        return None


def decrypt_mapping_legacy(token: str) -> Optional[dict]:
    """Decrypt pre-migration data. Do not use in normal request handling."""
    if not token:
        return None
    try:
        return _decode(token, _legacy_fernet())
    except SecretUnavailableError:
        return None
