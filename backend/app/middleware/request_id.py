"""Attach a request id to every request so logs and error responses can be correlated."""

import re
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

REQUEST_ID_HEADER = "X-Request-ID"
_SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def request_id_of(request: Request) -> str:
    return str(getattr(request.state, "request_id", "") or "-")


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        incoming = request.headers.get(REQUEST_ID_HEADER, "")
        request.state.request_id = incoming if _SAFE_ID.fullmatch(incoming) else uuid.uuid4().hex
        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request.state.request_id
        return response
