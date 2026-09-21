from fastapi.testclient import TestClient

from app.main import app

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
