"""Short-lived signed URLs for resources loaded by <img src>, which cannot send a bearer token.

The key is random per backend process: links stop working after a restart, which is fine
for URLs that live for minutes. Nothing about the user or the run's data is in the URL.
"""

import hashlib
import hmac
import secrets
import time
from urllib.parse import urlencode

_KEY = secrets.token_bytes(32)
DEFAULT_TTL_SECONDS = 15 * 60


def _signature(path: str, expires: int) -> str:
    return hmac.new(_KEY, f"{path}\n{expires}".encode("utf-8"), hashlib.sha256).hexdigest()


def sign_path(path: str, ttl_seconds: int = DEFAULT_TTL_SECONDS, now: float | None = None) -> str:
    """`path` is the API path without the /api prefix, e.g. /test-runs/<id>/screenshot."""
    expires = int((now if now is not None else time.time()) + ttl_seconds)
    return f"{path}?{urlencode({'expires': expires, 'sig': _signature(path, expires)})}"


def verify(path: str, expires: int | None, sig: str | None, now: float | None = None) -> bool:
    if not expires or not sig:
        return False
    if expires < (now if now is not None else time.time()):
        return False
    return hmac.compare_digest(_signature(path, int(expires)), sig)
