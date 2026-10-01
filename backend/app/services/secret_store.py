"""Encrypt-at-rest helper for Auth Profile credentials.

The key comes from environment configuration only - never from source or git.
Prefers TESTFLOW_SECRET_KEY; otherwise derives a stable key from the existing
server-side Supabase service-role secret so no plaintext is ever written.
"""

import base64
import hashlib
import json
import os
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


class SecretUnavailableError(RuntimeError):
    """Raised when no key material is configured."""


def _key_material() -> Optional[str]:
    explicit = (os.environ.get("TESTFLOW_SECRET_KEY") or "").strip()
    if explicit:
        return explicit
    fallback = (settings.SUPABASE_SERVICE_ROLE_KEY or "").strip()
    return fallback or None


def _fernet() -> Fernet:
    material = _key_material()
    if not material:
        raise SecretUnavailableError(
            "No encryption key configured. Set TESTFLOW_SECRET_KEY in the environment "
            "before storing Auth Profile credentials."
        )
    try:
        # A already-valid Fernet key is used directly.
        return Fernet(material.encode("utf-8"))
    except Exception:
        digest = hashlib.sha256(material.encode("utf-8")).digest()
        return Fernet(base64.urlsafe_b64encode(digest))


def is_configured() -> bool:
    return _key_material() is not None


def encrypt_mapping(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return _fernet().encrypt(raw).decode("utf-8")


def decrypt_mapping(token: str) -> Optional[dict]:
    if not token:
        return None
    try:
        raw = _fernet().decrypt(token.encode("utf-8"))
    except (InvalidToken, SecretUnavailableError, ValueError):
        return None
    try:
        value = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None
