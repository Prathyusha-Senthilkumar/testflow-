import json
import os
import time

from fastapi.testclient import TestClient

from app.main import app
from app.repositories.auth_profile_repository import auth_profile_repository

client = TestClient(app)


def _create_project(name: str = "Auth Profile Project"):
    res = client.post("/api/projects", json={"name": name, "baseUrl": "https://example.com"})
    assert res.status_code == 200, res.text
    return res.json()


def _create_case(project_id: str):
    res = client.post(
        f"/api/projects/{project_id}/test-cases",
        json={"name": "Authenticated Dashboard", "category": "Functional", "scenario": "Happy Path"},
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_auth_profile_crud_and_test_case_attach():
    project = _create_project()
    project_id = project["id"]
    created_ids = []
    try:
        empty = client.post(
            f"/api/projects/{project_id}/auth-profiles",
            json={"name": "   "},
        )
        assert empty.status_code == 400

        created = client.post(
            f"/api/projects/{project_id}/auth-profiles",
            json={"name": "Admin"},
        )
        assert created.status_code == 200, created.text
        profile = created.json()
        created_ids.append(profile["id"])
        assert profile["name"] == "Admin"
        assert profile["loginUrl"] == "https://example.com"
        assert profile["hasStorageState"] is False

        listed = client.get(f"/api/projects/{project_id}/auth-profiles")
        assert listed.status_code == 200
        assert any(item["id"] == profile["id"] for item in listed.json())

        case = _create_case(project_id)
        attached = client.patch(
            f"/api/projects/{project_id}/test-cases/{case['id']}",
            json={"authProfileId": profile["id"]},
        )
        assert attached.status_code == 200, attached.text
        assert attached.json()["authProfileId"] == profile["id"]

        missing = client.patch(
            f"/api/projects/{project_id}/test-cases/{case['id']}",
            json={"authProfileId": "auth-missing"},
        )
        assert missing.status_code == 404

        deleted = client.delete(f"/api/projects/{project_id}/auth-profiles/{profile['id']}")
        assert deleted.status_code == 204
        created_ids.remove(profile["id"])

        after_delete = client.get(f"/api/projects/{project_id}/test-cases/{case['id']}")
        assert after_delete.status_code == 200
        assert after_delete.json()["authProfileId"] in (None, "")
    finally:
        for profile_id in created_ids:
            client.delete(f"/api/projects/{project_id}/auth-profiles/{profile_id}")


def _write_session(project_id: str, profile_id: str, cookies: list, age_seconds: float = 0.0):
    path = auth_profile_repository.storage_state_path(project_id, profile_id)
    path.write_text(json.dumps({"cookies": cookies, "origins": []}), encoding="utf-8")
    if age_seconds:
        stamp = time.time() - age_seconds
        os.utime(path, (stamp, stamp))


def _fetch(project_id: str, profile_id: str) -> dict:
    res = client.get(f"/api/projects/{project_id}/auth-profiles")
    assert res.status_code == 200, res.text
    match = next(item for item in res.json() if item["id"] == profile_id)
    return match


def test_auth_profile_session_status_drives_renewal():
    project_id = _create_project("Auth Renewal Project")["id"]
    created = client.post(
        f"/api/projects/{project_id}/auth-profiles",
        json={"name": "Admin"},
    )
    assert created.status_code == 200, created.text
    profile_id = created.json()["id"]
    try:
        fresh = created.json()
        assert fresh["sessionStatus"] == "none"
        assert fresh["needsRenewal"] is False

        now = time.time()

        _write_session(project_id, profile_id, [{"name": "sid", "expires": now + 7 * 86400}])
        active = _fetch(project_id, profile_id)
        assert active["sessionStatus"] == "active"
        assert active["needsRenewal"] is False
        assert active["hasStorageState"] is True
        assert active["sessionExpiresAt"]

        _write_session(project_id, profile_id, [{"name": "sid", "expires": now + 1800}])
        assert _fetch(project_id, profile_id)["sessionStatus"] == "expiring"
        assert _fetch(project_id, profile_id)["needsRenewal"] is True

        _write_session(project_id, profile_id, [{"name": "sid", "expires": now - 60}])
        expired = _fetch(project_id, profile_id)
        assert expired["sessionStatus"] == "expired"
        assert expired["needsRenewal"] is True

        # Session-only cookies carry no expiry, so age decides.
        _write_session(project_id, profile_id, [{"name": "sid", "expires": -1}], age_seconds=10 * 86400)
        aged = _fetch(project_id, profile_id)
        assert aged["sessionStatus"] == "expired"
        assert aged["sessionExpiresAt"] is None
        assert aged["sessionRecordedAt"]

        _write_session(project_id, profile_id, [{"name": "sid", "expires": -1}])
        assert _fetch(project_id, profile_id)["sessionStatus"] == "active"

        # Derived status must not expose the stored session itself.
        payload = _fetch(project_id, profile_id)
        assert "cookies" not in payload
        assert "sid" not in json.dumps(payload)
    finally:
        client.delete(f"/api/projects/{project_id}/auth-profiles/{profile_id}")


def test_auth_profile_invalid_ids_and_no_secret_payload():
    project_id = _create_project("Auth Security Project")["id"]
    invalid_project = client.get("/api/projects/not%20valid/auth-profiles")
    assert invalid_project.status_code == 400

    created = client.post(
        f"/api/projects/{project_id}/auth-profiles",
        json={"name": "Student"},
    )
    assert created.status_code == 200
    profile = created.json()
    assert "storage_state" not in profile
    assert "cookies" not in profile
    assert "password" not in profile

    invalid_profile = client.delete(
        f"/api/projects/{project_id}/auth-profiles/not%20valid"
    )
    assert invalid_profile.status_code == 400

    client.delete(f"/api/projects/{project_id}/auth-profiles/{profile['id']}")
