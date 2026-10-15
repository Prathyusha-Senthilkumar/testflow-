import logging
import time
from typing import Optional

import httpx
from supabase import Client, ClientOptions, create_client

from app.config import settings
from app.logging_format import concise_error, redact

logger = logging.getLogger("testflow.database")

# Missing tables, columns and functions are schema gaps, not a new failure every poll.
_SCHEMA_CODES = {"PGRST202", "PGRST204", "PGRST205", "42703", "42P01"}
_SCHEMA_DEDUP_SECONDS = 300
_schema_seen: dict[str, float] = {}


def _has_credentials() -> bool:
    return bool(settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY)


def _resolve_active_mode() -> str:
    """
    Explicitly resolve storage mode. Never silently fall back to demo when
    Supabase was requested (USE_DEMO_DATA=false) but configuration is invalid.
    """
    if settings.USE_DEMO_DATA:
        return "demo"

    has_url = bool(settings.SUPABASE_URL)
    has_key = bool(settings.SUPABASE_SERVICE_ROLE_KEY)

    if has_url and has_key:
        return "supabase"

    if has_url or has_key:
        raise RuntimeError(
            "Supabase mode requested (USE_DEMO_DATA=false) but configuration is incomplete: "
            "both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. "
            "Set both, or set USE_DEMO_DATA=true for demo mode."
        )

    raise RuntimeError(
        "No storage configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to persist to "
        "Supabase, or set USE_DEMO_DATA=true to use in-memory demo mode."
    )


def get_active_storage_mode() -> str:
    return _resolve_active_mode()


_client: Optional[Client] = None


def _db_action(request: httpx.Request) -> str:
    parts = [part for part in request.url.path.split("/") if part]
    operation = {
        "GET": "select",
        "HEAD": "select",
        "POST": "insert",
        "PATCH": "update",
        "PUT": "upsert",
        "DELETE": "delete",
    }.get(request.method, request.method.lower())
    if "rpc" in parts:
        index = parts.index("rpc")
        name = parts[index + 1] if index + 1 < len(parts) else "rpc"
        return f"database rpc {name}"
    if len(parts) >= 3 and parts[0] == "rest":
        return f"database {operation} {parts[-1]}"
    if parts:
        return f"database {operation} {parts[-1]}"
    return f"database {operation}"


def _response_detail(response: httpx.Response) -> tuple[str, str]:
    code = ""
    try:
        response.read()
        payload = response.json()
    except Exception:
        payload = None
    if isinstance(payload, dict):
        code = str(payload.get("code") or "")
        message = payload.get("message") or payload.get("error") or payload.get("msg") or ""
        detail = str(message).strip()
        if code and code not in detail:
            detail = f"{code}: {detail}" if detail else code
        if detail:
            return code, redact(detail)
    try:
        text = redact(response.text or "")
    except Exception:
        text = ""
    return code, text or f"HTTP {response.status_code}"


def _log_database_failure(action: str, detail: str, *, code: str = "", status: int | None = None) -> None:
    schema = code in _SCHEMA_CODES or any(token in detail for token in _SCHEMA_CODES)
    if schema:
        now = time.monotonic()
        key = f"{action}|{detail}"
        previous = _schema_seen.get(key)
        if previous is not None and now - previous < _SCHEMA_DEDUP_SECONDS:
            return
        _schema_seen[key] = now
    level = logging.WARNING if schema or (status is not None and status < 500) else logging.ERROR
    logger.log(level, f"{action} failed: {detail}" if detail else f"{action} failed")


class _RetryDisconnectedTransport(httpx.HTTPTransport):
    """Retry one read when Supabase closes a keep-alive connection, and log failures."""

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        try:
            response = super().handle_request(request)
        except httpx.RemoteProtocolError as exc:
            if request.method not in {"GET", "HEAD"}:
                _log_database_failure(_db_action(request), concise_error(exc))
                raise
            try:
                response = super().handle_request(request)
            except httpx.HTTPError as retry_exc:
                _log_database_failure(_db_action(request), concise_error(retry_exc))
                raise
        except httpx.HTTPError as exc:
            _log_database_failure(_db_action(request), concise_error(exc))
            raise
        if response.status_code >= 400:
            try:
                code, detail = _response_detail(response)
                _log_database_failure(_db_action(request), detail, code=code, status=response.status_code)
            except Exception as exc:
                logger.warning("%s failed: %s", _db_action(request), concise_error(exc))
        return response


def get_supabase_client() -> Optional[Client]:
    global _client
    if _resolve_active_mode() != "supabase":
        return None
    if _client is None:
        http_client = httpx.Client(
            transport=_RetryDisconnectedTransport(),
            timeout=httpx.Timeout(30.0),
        )
        _client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
            options=ClientOptions(httpx_client=http_client),
        )
    return _client


# Resolved lazily by repositories; not created eagerly so importing this module
# never crashes tooling before configuration is known.
supabase_client: Optional[Client] = None
