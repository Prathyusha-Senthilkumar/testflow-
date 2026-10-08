"""Fernet helpers for Auth Profile secrets.

Normal runtime encryption/decryption uses TESTFLOW_SECRET_KEY only (read via app.config).
There is no silent fallback to the Supabase service-role key. The legacy
service-role-derived key is exposed only to the explicit one-time re-key tool
(scripts/rekey_auth_profiles.py) so rotating Supabase credentials cannot silently
make Auth Profiles unreadable. The Node worker (worker/src/fernet.ts) follows the
same key rules.

Runtime decryption is strict: a missing/invalid key raises SecretUnavailableError and a
token that does not decrypt raises SecretDecryptError, instead of looking like "no session".
"""

import base64
import hashlib
import json
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


class SecretUnavailableError(RuntimeError):
    """Raised when the dedicated Auth Profile key is unavailable or invalid."""


class SecretDecryptError(RuntimeError):
    """Raised when a stored value cannot be decrypted with TESTFLOW_SECRET_KEY."""


def _explicit_fernet() -> Fernet:
    material = (settings.TESTFLOW_SECRET_KEY or "").strip()
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


def _decode(token: str, fernet: Fernet) -> dict:
    try:
        raw = fernet.decrypt(token.encode("utf-8"))
        value = json.loads(raw.decode("utf-8"))
    except (InvalidToken, ValueError, json.JSONDecodeError) as exc:
        raise SecretDecryptError(
            "A saved Auth Profile secret could not be decrypted. TESTFLOW_SECRET_KEY must match "
            "the key it was saved with (see docs/AUTH_PROFILE_REKEY.md)."
        ) from exc
    if not isinstance(value, dict):
        raise SecretDecryptError("A saved Auth Profile secret has an unexpected shape.")
    return value


def decrypt_mapping(token: str) -> Optional[dict]:
    """Decrypt runtime data with the dedicated key. None only when nothing is stored.

    Raises SecretUnavailableError (no/invalid key) or SecretDecryptError (wrong key, corrupt).
    """
    if not token:
        return None
    return _decode(token, _explicit_fernet())


def try_decrypt_mapping(token: str) -> Optional[dict]:
    """Tolerant variant for the re-key tool: None when the dedicated key cannot read it."""
    try:
        return decrypt_mapping(token)
    except (SecretUnavailableError, SecretDecryptError):
        return None


def decrypt_mapping_legacy(token: str) -> Optional[dict]:
    """Decrypt pre-migration data. Do not use in normal request handling."""
    if not token:
        return None
    try:
        return _decode(token, _legacy_fernet())
    except (SecretUnavailableError, SecretDecryptError):
        return None
