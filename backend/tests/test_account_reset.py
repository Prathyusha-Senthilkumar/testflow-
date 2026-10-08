"""Forgot-password must never hand a recovery link to an unauthenticated caller."""

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.services import account_service

client = TestClient(app)
GENERIC = "If an account exists for that email, a reset link has been sent."


def _no_admin_calls(monkeypatch, recover_error: HTTPException | None):
    calls: list[str] = []

    def fake_auth_request(method, path, body=None, user_token=None):
        calls.append(path)
        assert "admin" not in path, "forgot-password must not call admin endpoints"
        if recover_error is not None:
            raise recover_error
        return {}

    monkeypatch.setattr(account_service, "_auth_request", fake_auth_request)
    return calls


def test_forgot_password_mailer_failure_returns_generic_message(monkeypatch, caplog):
    calls = _no_admin_calls(
        monkeypatch, HTTPException(status_code=400, detail="Error sending recovery email")
    )
    res = client.post("/api/auth/forgot-password", json={"email": "user@example.com"})
    assert res.status_code == 200
    assert res.json() == {"message": GENERIC}
    assert "resetLink" not in res.text
    assert calls and calls[0].startswith("/auth/v1/recover")
    assert "user@example.com" not in caplog.text


def test_forgot_password_success_returns_generic_message(monkeypatch):
    _no_admin_calls(monkeypatch, None)
    res = client.post("/api/auth/forgot-password", json={"email": "user@example.com"})
    assert res.status_code == 200
    assert res.json() == {"message": GENERIC}


def test_forgot_password_unknown_error_is_not_leaked(monkeypatch):
    _no_admin_calls(monkeypatch, HTTPException(status_code=401, detail="User not found"))
    res = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert res.status_code == 200
    assert res.json() == {"message": GENERIC}


def test_unhandled_error_does_not_leak_exception_text():
    from fastapi import APIRouter

    router = APIRouter()

    @router.get("/__boom")
    def boom():
        raise RuntimeError("secret-internal-detail")

    app.include_router(router)
    res = TestClient(app, raise_server_exceptions=False).get("/__boom")
    assert res.status_code == 500
    assert "secret-internal-detail" not in res.text
    assert res.json()["message"].startswith("Internal server error")
    assert res.headers.get("X-Request-ID")
