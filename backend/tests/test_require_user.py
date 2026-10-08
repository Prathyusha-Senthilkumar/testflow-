"""Every /api route needs a verified Supabase token except the public account routes and health."""

import pytest
from fastapi.testclient import TestClient

from auth_helpers import TEST_USER_ID, auth_headers, make_token
from app.config import settings
from app.main import app
from app.services import account_service, signed_urls

client = TestClient(app)


def test_missing_token_is_401_with_message():
    res = client.get("/api/projects")
    assert res.status_code == 401
    assert res.json() == {"message": "Sign in required."}


@pytest.mark.parametrize(
    "headers",
    [
        {"Authorization": "Bearer not-a-jwt"},
        {"Authorization": "Basic abc"},
        {"Authorization": "Bearer"},
        auth_headers(secret="some-other-secret-value-0123456789abcdef"),
        auth_headers(aud="anon"),
    ],
)
def test_bad_token_is_401(headers):
    res = client.get("/api/projects", headers=headers)
    assert res.status_code == 401
    assert "message" in res.json()


def test_expired_token_is_401():
    res = client.get("/api/projects", headers=auth_headers(exp_offset=-60))
    assert res.status_code == 401
    assert "expired" in res.json()["message"].lower()


def test_valid_hs256_token_is_200():
    res = client.get("/api/projects", headers=auth_headers())
    assert res.status_code == 200


def test_signed_in_account_routes_need_a_token():
    assert client.get("/api/auth/me").status_code == 401
    assert client.post("/api/auth/password", json={"password": "secret123"}).status_code == 401


def test_health_is_public():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_public_auth_routes_stay_open(monkeypatch):
    def fake_auth_request(method, path, body=None, user_token=None):
        if path.startswith("/auth/v1/token"):
            return {"access_token": "a", "refresh_token": "r", "user": {"id": TEST_USER_ID, "email": "t@example.com"}}
        if path.startswith("/auth/v1/signup"):
            return {"email": "t@example.com", "id": TEST_USER_ID}
        if path.startswith("/auth/v1/user"):
            return {"id": TEST_USER_ID, "email": "t@example.com"}
        return {}

    monkeypatch.setattr(account_service, "_auth_request", fake_auth_request)
    assert client.post("/api/auth/login", json={"email": "t@example.com", "password": "secret123"}).status_code == 200
    assert client.post(
        "/api/auth/signup", json={"email": "t@example.com", "password": "secret123", "name": "T"}
    ).status_code == 200
    assert client.post("/api/auth/refresh", json={"refreshToken": "r"}).status_code == 200
    assert client.post("/api/auth/forgot-password", json={"email": "t@example.com"}).status_code == 200
    assert client.post(
        "/api/auth/reset-password", json={"accessToken": "a", "password": "secret123"}
    ).status_code == 200


def test_auth_disabled_only_bypasses_in_demo_mode(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_DISABLED", True)
    monkeypatch.setattr(settings, "USE_DEMO_DATA", True)
    assert client.get("/api/projects").status_code == 200
    monkeypatch.setattr(settings, "USE_DEMO_DATA", False)
    # Enforced again: no token -> 401 before any storage access.
    assert client.get("/api/projects").status_code == 401


def test_no_verification_key_is_503(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", None)
    monkeypatch.setattr(settings, "SUPABASE_URL", None)
    res = client.get("/api/projects", headers={"Authorization": f"Bearer {make_token()}"})
    assert res.status_code == 503


def test_screenshot_images_need_a_valid_signature():
    assert client.get("/api/test-runs/run-1/screenshot").status_code == 401
    bad = "/api/test-runs/run-1/screenshot?expires=9999999999&sig=deadbeef"
    assert client.get(bad).status_code == 401
    good = "/api" + signed_urls.sign_path("/test-runs/run-1/screenshot")
    # Signature accepted; demo mode has no stored screenshot, so 404 (not 401).
    assert client.get(good).status_code == 404
    expired = "/api" + signed_urls.sign_path("/test-runs/run-1/screenshot", ttl_seconds=-1)
    assert client.get(expired).status_code == 401
    other = signed_urls.sign_path("/test-runs/run-2/screenshot").split("?", 1)[1]
    assert client.get(f"/api/test-runs/run-1/screenshot?{other}").status_code == 401
