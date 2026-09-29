import json
import urllib.error
import urllib.parse
import urllib.request

from fastapi import HTTPException

from app.config import settings
from app.schemas.account import AccountResponse


def _require_config() -> tuple[str, str]:
    url = (settings.SUPABASE_URL or "").rstrip("/")
    key = settings.SUPABASE_SERVICE_ROLE_KEY or ""
    if not url or not key:
        raise HTTPException(status_code=503, detail="Sign-in is not configured on the server.")
    return url, key


def _auth_request(method: str, path: str, body: dict | None = None, user_token: str | None = None) -> dict:
    url, key = _require_config()
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(f"{url}{path}", data=data, method=method)
    request.add_header("apikey", key)
    request.add_header("Authorization", f"Bearer {user_token or key}")
    request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode() or "{}"
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode() or "{}"
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {}
        message = (
            payload.get("error_description")
            or payload.get("msg")
            or payload.get("message")
            or "Request failed"
        )
        status = 401 if exc.code in (400, 401, 403) else 400
        raise HTTPException(status_code=status, detail=str(message)) from exc
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=503, detail="Could not reach the sign-in service.") from exc
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="Sign-in service returned an unexpected response.") from exc
    return parsed if isinstance(parsed, dict) else {}


def _display_name(user: dict) -> str:
    meta = user.get("user_metadata") or {}
    name = str(meta.get("full_name") or meta.get("name") or "").strip()
    if name:
        return name
    email = str(user.get("email") or "")
    return email.split("@", 1)[0] or "Account"


def _from_session(payload: dict) -> AccountResponse:
    user = payload.get("user") if isinstance(payload.get("user"), dict) else {}
    return AccountResponse(
        accessToken=payload.get("access_token"),
        refreshToken=payload.get("refresh_token"),
        userId=user.get("id"),
        email=str(user.get("email") or ""),
        name=_display_name(user),
    )


def _from_user(user: dict, access_token: str | None = None, refresh_token: str | None = None) -> AccountResponse:
    return AccountResponse(
        accessToken=access_token,
        refreshToken=refresh_token,
        userId=user.get("id"),
        email=str(user.get("email") or ""),
        name=_display_name(user),
    )


def login(email: str, password: str) -> AccountResponse:
    email = email.strip()
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required.")
    payload = _auth_request(
        "POST",
        "/auth/v1/token?grant_type=password",
        {"email": email, "password": password},
    )
    if not payload.get("access_token"):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return _from_session(payload)


def signup(email: str, password: str, name: str) -> AccountResponse:
    email = email.strip()
    name = name.strip()
    if not email or not password or not name:
        raise HTTPException(status_code=400, detail="Name, email, and password are required.")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    payload = _auth_request(
        "POST",
        "/auth/v1/signup",
        {"email": email, "password": password, "data": {"full_name": name}},
    )
    if payload.get("access_token"):
        return _from_session(payload)
    user = payload if payload.get("email") else payload.get("user") or {}
    if not isinstance(user, dict):
        user = {}
    return AccountResponse(
        email=str(user.get("email") or email),
        name=name,
        userId=user.get("id"),
        confirmationRequired=True,
    )


def refresh(refresh_token: str) -> AccountResponse:
    if not refresh_token.strip():
        raise HTTPException(status_code=401, detail="Sign in required.")
    payload = _auth_request(
        "POST",
        "/auth/v1/token?grant_type=refresh_token",
        {"refresh_token": refresh_token},
    )
    if not payload.get("access_token"):
        raise HTTPException(status_code=401, detail="Your session has expired. Sign in again.")
    return _from_session(payload)


def display_names(user_ids: list[str]) -> dict[str, str]:
    """Account names from Supabase Auth. Empty when a user cannot be loaded."""
    names: dict[str, str] = {}
    for user_id in user_ids:
        if not user_id or user_id in names:
            continue
        try:
            user = _auth_request("GET", f"/auth/v1/admin/users/{user_id}")
        except HTTPException:
            continue
        if isinstance(user.get("user"), dict):
            user = user["user"]
        if not isinstance(user, dict) or not user.get("id"):
            continue
        names[str(user.get("id"))] = _display_name(user)
    return names


def actor_from_authorization(authorization: str | None) -> tuple[str, str] | None:
    """Signed-in user id and display name, or None when the request has no usable session."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        account = current_user(token)
    except HTTPException:
        return None
    user_id = str(account.userId or "").strip()
    if not user_id:
        return None
    return user_id, account.name or account.email or "Account"


def current_user(access_token: str) -> AccountResponse:
    user = _auth_request("GET", "/auth/v1/user", user_token=access_token)
    if not user.get("id"):
        raise HTTPException(status_code=401, detail="Sign in required.")
    return _from_user(user, access_token=access_token)


def update_profile(access_token: str, name: str) -> AccountResponse:
    name = name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required.")
    user = _auth_request(
        "PUT",
        "/auth/v1/user",
        {"data": {"full_name": name}},
        user_token=access_token,
    )
    return _from_user(user, access_token=access_token)


def request_password_reset(email: str) -> str | None:
    """Send a reset email. When the mailer fails, return a recovery link instead."""
    email = email.strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required.")
    redirect = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password"
    try:
        _auth_request(
            "POST",
            "/auth/v1/recover?redirect_to=" + urllib.parse.quote(redirect, safe=""),
            {"email": email},
        )
    except HTTPException as exc:
        if "sending recovery email" not in str(exc.detail).lower():
            raise
        return _recovery_link(email, redirect)
    return None


def _recovery_link(email: str, redirect: str) -> str:
    payload = _auth_request(
        "POST",
        "/auth/v1/admin/generate_link",
        {"type": "recovery", "email": email, "options": {"redirect_to": redirect}},
    )
    properties = payload.get("properties") if isinstance(payload.get("properties"), dict) else {}
    link = payload.get("action_link") or properties.get("action_link")
    if not link:
        raise HTTPException(status_code=400, detail="Could not create a reset link.")
    return str(link)


def reset_password(access_token: str, password: str) -> AccountResponse:
    if not access_token.strip():
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired.")
    return update_password(access_token.strip(), password)


def update_password(access_token: str, password: str) -> AccountResponse:
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    user = _auth_request(
        "PUT",
        "/auth/v1/user",
        {"password": password},
        user_token=access_token,
    )
    return _from_user(user, access_token=access_token)
