"""JSON logs. One message field carries the outcome and, on failure, a short error.

correlation_id, user_id, user_email, method and timestamp are always present.
error text is folded into message, for example "Request failed: Sign in required."
"""

import json
import logging
import re
import time
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone

correlation_id_var: ContextVar[str] = ContextVar("correlation_id", default="")
user_id_var: ContextVar[str] = ContextVar("user_id", default="")
user_email_var: ContextVar[str] = ContextVar("user_email", default="")
method_var: ContextVar[str] = ContextVar("method", default="")

_SECRET_QUERY = re.compile(r"(?i)(token|password|secret|key|code)=[^&\s]*")
_BEARER = re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._\-]+=*")
_JWT = re.compile(r"\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]+\b")
_ASSIGN = re.compile(r"(?i)\b(password|token|secret|authorization)\b\s*[:=]\s*\S+")
_DICT_MESSAGE = re.compile(r"""['"]message['"]\s*:\s*['"]([^'"]+)['"]""")
_MAX_ERROR = 180
_deduped: dict[str, float] = {}


def bind_request(correlation_id: str, method: str) -> None:
    correlation_id_var.set(correlation_id)
    method_var.set(method)


def bind_user(user_id: str, email: str) -> None:
    user_id_var.set(user_id or "")
    user_email_var.set(email or "")


def bind_background(name: str) -> str:
    """Correlation id for work that is not an HTTP request (queue, sweep, poll)."""
    correlation_id = f"{name}-{uuid.uuid4().hex[:12]}"
    correlation_id_var.set(correlation_id)
    method_var.set("")
    user_id_var.set("")
    user_email_var.set("")
    return correlation_id


def clear_request_context() -> None:
    correlation_id_var.set("")
    user_id_var.set("")
    user_email_var.set("")
    method_var.set("")


def redact(text: str) -> str:
    cleaned = _BEARER.sub("bearer redacted", text or "")
    cleaned = _JWT.sub("redacted", cleaned)
    cleaned = _ASSIGN.sub(r"\1=redacted", cleaned)
    cleaned = _SECRET_QUERY.sub(r"\1=redacted", cleaned)
    cleaned = " ".join(cleaned.split())
    if len(cleaned) > _MAX_ERROR:
        cleaned = cleaned[: _MAX_ERROR - 1] + "…"
    return cleaned


def concise_error(exc: BaseException | None) -> str:
    """One line, safe to print. No tokens, no multi-line dumps."""
    if exc is None:
        return ""
    text = ""
    message = getattr(exc, "message", None)
    if isinstance(message, str) and message.strip():
        text = message.strip()
    if not text:
        raw = str(exc).strip()
        text = raw.splitlines()[0] if raw else ""
    if text.startswith("{") or text.startswith("["):
        found = _DICT_MESSAGE.search(text)
        if found:
            text = found.group(1)
    if not text:
        text = exc.__class__.__name__
    return redact(text)


def outcome_message(action: str, error: str = "") -> str:
    """Success is the action. Failure is the action plus the short error."""
    detail = redact(error) if error else ""
    if not detail or detail in action:
        return action
    return f"{action}: {detail}"


def log_failure(
    logger: logging.Logger,
    action: str,
    exc: BaseException | None = None,
    *,
    level: int = logging.ERROR,
    dedupe_seconds: float = 0,
) -> None:
    """Log one failure. Repeated identical lines can be held back with dedupe_seconds."""
    text = outcome_message(f"{action} failed", concise_error(exc) if exc is not None else "")
    if dedupe_seconds > 0:
        now = time.monotonic()
        previous = _deduped.get(text)
        if previous is not None and now - previous < dedupe_seconds:
            return
        _deduped[text] = now
        if len(_deduped) > 300:
            cutoff = now - dedupe_seconds
            for key, seen in list(_deduped.items()):
                if seen < cutoff:
                    del _deduped[key]
    logger.log(level, text)


def safe_target(path: str, query: str) -> str:
    target = path or "/"
    if query:
        target = f"{target}?{_SECRET_QUERY.sub(r'\1=redacted', query)}"
    return target


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        error_message = str(getattr(record, "error_message", "") or "")
        if not error_message and record.exc_info and record.exc_info[1] is not None:
            error_message = concise_error(record.exc_info[1])
        payload = {
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
            "level": record.levelname.lower(),
            "correlation_id": str(getattr(record, "correlation_id", "") or correlation_id_var.get()),
            "user_id": str(getattr(record, "user_id", "") or user_id_var.get()),
            "user_email": str(getattr(record, "user_email", "") or user_email_var.get()),
            "method": str(getattr(record, "method", "") or method_var.get()),
            "message": outcome_message(record.getMessage(), error_message),
        }
        status = getattr(record, "status", None)
        path = getattr(record, "path", None)
        if status is not None:
            payload["status"] = status
        if path:
            payload["path"] = path
        return json.dumps(payload, ensure_ascii=False)


def configure_logging() -> None:
    """JSON for application logs. Uvicorn's own access line is replaced by ours."""
    json_handler = logging.StreamHandler()
    json_handler.setFormatter(JsonLogFormatter())
    app_log = logging.getLogger("testflow")
    app_log.handlers = [json_handler]
    app_log.setLevel(logging.INFO)
    app_log.propagate = False

    access = logging.getLogger("testflow.access")
    plain = logging.StreamHandler()
    plain.setFormatter(logging.Formatter("%(message)s"))
    access.handlers = [plain]
    access.setLevel(logging.INFO)
    access.propagate = False

    logging.getLogger("uvicorn.access").disabled = True
