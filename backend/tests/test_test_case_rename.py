"""PATCH can rename a test case and change its description (demo mode)."""
import pytest
from fastapi.testclient import TestClient

from auth_helpers import auth_headers

from app.main import app
import app.services.test_cases_service as test_cases_service_module

client = TestClient(app, headers=auth_headers())


@pytest.fixture(autouse=True)
def _files_in_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr(test_cases_service_module, "_REPO_ROOT", tmp_path)


def _case():
    project = client.post("/api/projects", json={"name": "Rename Project", "baseUrl": "https://example.com"}).json()
    case = client.post(f"/api/projects/{project['id']}/test-cases", json={"name": "Untitled test"}).json()
    return project["id"], case["id"]


def test_rename_and_describe():
    project_id, case_id = _case()
    res = client.patch(
        f"/api/projects/{project_id}/test-cases/{case_id}",
        json={"name": "  Open Assessments  ", "description": "Checks the list loads."},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["id"] == case_id
    assert body["name"] == "Open Assessments"
    assert body["description"] == "Checks the list loads."


def test_blank_name_is_rejected():
    project_id, case_id = _case()
    res = client.patch(f"/api/projects/{project_id}/test-cases/{case_id}", json={"name": "   "})
    assert res.status_code == 400
    assert "name" in res.json()["message"].lower()


def test_other_updates_keep_the_name():
    project_id, case_id = _case()
    res = client.patch(f"/api/projects/{project_id}/test-cases/{case_id}", json={"scenario": "Negative"})
    assert res.status_code == 200
    assert res.json()["name"] == "Untitled test"
