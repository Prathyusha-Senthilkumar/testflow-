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

logger = logging.getLogger("testflow.auth")

AUDIENCE = "authenticated"
_ASYMMETRIC_ALGORITHMS = ["RS256", "ES256"]
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
    """Verified claims, or HTTPException(401). Raises 503 when no verification key is configured."""
    options = {"require": ["exp", "sub"]}
    try:
        secret = (settings.SUPABASE_JWT_SECRET or "").strip()
        if secret:
            return jwt.decode(token, secret, algorithms=["HS256"], audience=AUDIENCE, options=options)
        base = (settings.SUPABASE_URL or "").strip().rstrip("/")
        if not base:
            logger.error("event=auth_misconfigured reason=no_jwt_secret_or_supabase_url")
            raise HTTPException(status_code=503, detail="Sign-in is not configured on the server.")
        signing_key = _jwks_client(f"{base}/auth/v1/.well-known/jwks.json").get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=_ASYMMETRIC_ALGORITHMS,
            audience=AUDIENCE,
            options=options,
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Your session has expired. Sign in again.") from exc
    except jwt.PyJWKClientConnectionError as exc:
        logger.error("event=auth_jwks_unreachable")
        raise HTTPException(status_code=503, detail="Could not reach the sign-in service.") from exc
    except jwt.PyJWTError as exc:
        logger.info("event=auth_token_rejected reason=%s", exc.__class__.__name__)
        raise HTTPException(status_code=401, detail="Sign in required.") from exc


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
    """(user id, display name) for run attribution. None for the demo bypass user."""
    if user.is_demo_bypass:
        return None
    return user.id, user.name
