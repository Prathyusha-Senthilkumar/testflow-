"""Attach a request id to every request so logs and error responses can be correlated."""

import logging
import re
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.logging_format import bind_request, clear_request_context, outcome_message, safe_target

REQUEST_ID_HEADER = "X-Request-ID"
_SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_access_line = logging.getLogger("testflow.access")
_access_json = logging.getLogger("testflow.request")


def request_id_of(request: Request) -> str:
    return str(getattr(request.state, "request_id", "") or "-")


def _status_phrase(status: int) -> str:
    phrases = {200: "OK", 201: "Created", 204: "No Content", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 409: "Conflict", 422: "Unprocessable Entity", 500: "Internal Server Error", 503: "Service Unavailable"}
    return phrases.get(status, "Error" if status >= 400 else "OK")


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        incoming = request.headers.get(REQUEST_ID_HEADER, "")
        request_id = incoming if _SAFE_ID.fullmatch(incoming) else uuid.uuid4().hex
        request.state.request_id = request_id
        request.state.error_message = ""
        bind_request(request_id, request.method)
        try:
            response = await call_next(request)
        finally:
            clear_request_context()
        response.headers[REQUEST_ID_HEADER] = request_id

        user = getattr(request.state, "user", None)
        user_id = str(getattr(user, "id", "") or "")
        user_email = str(getattr(user, "email", "") or "")
        status = response.status_code
        target = safe_target(request.url.path, request.url.query)
        http_version = request.scope.get("http_version") or "1.1"
        client = request.client
        host = client.host if client else "-"
        port = client.port if client else 0
        _access_line.info(
            '%s:%s - "%s %s HTTP/%s" %s %s',
            host,
            port,
            request.method,
            target,
            http_version,
            status,
            _status_phrase(status),
        )
        error_message = str(getattr(request.state, "error_message", "") or "")
        if status >= 500:
            level = logging.ERROR
        elif status >= 400:
            level = logging.WARNING
        else:
            level = logging.INFO
        message = "Request completed" if status < 400 else outcome_message("Request failed", error_message)
        _access_json.log(
            level,
            message,
            extra={
                "correlation_id": request_id,
                "user_id": user_id,
                "user_email": user_email,
                "method": request.method,
                "path": target,
                "status": status,
            },
        )
        return response
