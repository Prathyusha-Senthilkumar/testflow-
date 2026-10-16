"""API authentication: every /api route except the public account routes needs a Supabase access token.

Tokens are verified locally (no network round trip per request):
  * HS256 with SUPABASE_JWT_SECRET when it is configured, otherwise
  * the project's JWKS at SUPABASE_URL/auth/v1/.well-known/jwks.json (RS256/ES256).
`exp` and `aud="authenticated"` are always checked. Token contents are never logged.
"""

import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request

from app.config import settings
from app.logging_format import bind_user, log_failure

logger = logging.getLogger("testflow.auth")

AUDIENCE = "authenticated"
_ASYMMETRIC_ALGORITHMS = ["RS256", "ES256"]
# Supabase stamps iat from its own clock. A container a few seconds behind
# otherwise rejects a brand-new token as "not yet valid".
_CLOCK_LEEWAY_SECONDS = 30
DEMO_USER_ID = "00000000-0000-0000-0000-000000000000"


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    name: str
    email: str = ""
    is_demo_bypass: bool = False


def auth_bypass_enabled() -> bool:
    """AUTH_DISABLED only works in demo mode. Real data always needs a token."""
    return bool(settings.AUTH_DISABLED and settings.USE_DEMO_DATA)


@lru_cache(maxsize=4)
def _jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(url, cache_keys=True, lifespan=3600, timeout=10)


def _bearer_token(request: Request) -> str:
    header = request.headers.get("authorization") or ""
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="Sign in required.")
    return token.strip()


def decode_access_token(token: str) -> dict:
    """Verified claims, or HTTPException(401). Raises 503 when no verification key is configured.

    HS256 tokens are checked with SUPABASE_JWT_SECRET. ES256/RS256 tokens are checked
    against the project's JWKS. When that local check cannot be done, Supabase Auth
    confirms the access token.
    """
    options = {"require": ["exp", "sub"]}
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        log_failure(logger, "auth.token", exc, level=logging.WARNING)
        raise HTTPException(status_code=401, detail="Sign in required.") from exc
    alg = str(header.get("alg") or "")
    try:
        if alg == "HS256":
            secret = (settings.SUPABASE_JWT_SECRET or "").strip()
            if not secret:
                return _claims_from_auth_server(token)
            return jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                audience=AUDIENCE,
                options=options,
                leeway=_CLOCK_LEEWAY_SECONDS,
            )
        if alg in _ASYMMETRIC_ALGORITHMS:
            base = (settings.SUPABASE_URL or "").strip().rstrip("/")
            if not base:
                log_failure(logger, "auth.config", level=logging.ERROR)
                raise HTTPException(status_code=503, detail="Sign-in is not configured on the server.")
            signing_key = _jwks_client(f"{base}/auth/v1/.well-known/jwks.json").get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=_ASYMMETRIC_ALGORITHMS,
                audience=AUDIENCE,
                options=options,
                leeway=_CLOCK_LEEWAY_SECONDS,
            )
        raise HTTPException(status_code=401, detail="Sign in required.")
    except jwt.ExpiredSignatureError as exc:
        log_failure(logger, "auth.token", exc, level=logging.WARNING)
        raise HTTPException(status_code=401, detail="Your session has expired. Sign in again.") from exc
    except jwt.PyJWKClientConnectionError as exc:
        log_failure(logger, "auth.jwks", exc)
        raise HTTPException(status_code=503, detail="Could not reach the sign-in service.") from exc
    except jwt.PyJWTError as exc:
        log_failure(logger, "auth.token", exc, level=logging.WARNING)
        if alg in _ASYMMETRIC_ALGORITHMS:
            return _claims_from_auth_server(token)
        raise HTTPException(status_code=401, detail="Sign in required.") from exc


def _claims_from_auth_server(token: str) -> dict:
    """Claims for an access token Supabase Auth accepts. The token itself is never logged."""
    from app.services.account_service import _auth_request

    user = _auth_request("GET", "/auth/v1/user", user_token=token)
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in required.")
    metadata = user.get("user_metadata") if isinstance(user.get("user_metadata"), dict) else {}
    return {"sub": user_id, "email": str(user.get("email") or ""), "user_metadata": metadata}


def _user_from_claims(claims: dict) -> AuthenticatedUser:
    user_id = str(claims.get("sub") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in required.")
    meta = claims.get("user_metadata") if isinstance(claims.get("user_metadata"), dict) else {}
    email = str(claims.get("email") or "")
    name = str(meta.get("full_name") or meta.get("name") or "").strip() or email.split("@", 1)[0] or "Account"
    return AuthenticatedUser(id=user_id, name=name, email=email)


def require_user(request: Request) -> AuthenticatedUser:
    """Router-level dependency. Stores the user on request.state for later dependencies."""
    cached = getattr(request.state, "user", None)
    if isinstance(cached, AuthenticatedUser):
        return cached
    if auth_bypass_enabled():
        user = AuthenticatedUser(id=DEMO_USER_ID, name="Demo user", is_demo_bypass=True)
    else:
        user = _user_from_claims(decode_access_token(_bearer_token(request)))
    request.state.user = user
    return user


def current_user_id(user: AuthenticatedUser = Depends(require_user)) -> str:
    return user.id


def current_actor(user: AuthenticatedUser = Depends(require_user)) -> Optional[tuple[str, str]]:
    bind_user(user.id, user.email)
    """(user id, display name) for run attribution. None for the demo bypass user."""
    if user.is_demo_bypass:
        return None
    return user.id, user.name
