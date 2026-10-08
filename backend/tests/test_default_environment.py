"""Project default environment: first is default, switching, delete promotion, unmigrated DB."""

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from auth_helpers import auth_headers
from app.main import app
from app.repositories.environment_repository import (
    DefaultColumnMissing,
    EnvironmentRepository,
    _is_missing_column,
)
from app.repositories.project_repository import project_repository
from app.schemas.environment import CreateEnvironmentDto, EnvironmentSummary
from app.services.environments_service import EnvironmentsService, pick_default

client = TestClient(app, headers=auth_headers())


def _project(name="Default Env Project") -> str:
    res = client.post("/api/projects", json={"name": name, "baseUrl": "https://example.com"})
    assert res.status_code == 200, res.text
    return res.json()["id"]


def _envs(project_id):
    res = client.get(f"/api/projects/{project_id}/environments")
    assert res.status_code == 200, res.text
    return res.json()


def _create_env(project_id, name):
    res = client.post(
        f"/api/projects/{project_id}/environments",
        json={"name": name, "baseUrl": f"https://{name.lower()}.example.com"},
    )
    assert res.status_code == 200, res.text
    return res.json()


def _defaults(envs):
    return [env["id"] for env in envs if env["isDefault"]]


def test_new_project_flags_its_first_environment():
    project_id = _project()
    envs = _envs(project_id)
    assert len(envs) == 1
    assert _defaults(envs) == [envs[0]["id"]]
    staging = _create_env(project_id, "Staging")
    assert staging["isDefault"] is False
    assert _defaults(_envs(project_id)) == [envs[0]["id"]]


def test_set_default_switches_and_returns_the_list():
    project_id = _project()
    staging = _create_env(project_id, "Staging")
    res = client.post(f"/api/projects/{project_id}/environments/{staging['id']}/default")
    assert res.status_code == 200, res.text
    assert _defaults(res.json()) == [staging["id"]]
    assert _defaults(_envs(project_id)) == [staging["id"]]


def test_set_default_unknown_environment_is_404():
    project_id = _project()
    res = client.post(f"/api/projects/{project_id}/environments/env-missing/default")
    assert res.status_code == 404
    assert "message" in res.json()


def test_deleting_the_default_promotes_the_oldest_remaining():
    project_id = _project()
    staging = _create_env(project_id, "Staging")
    _create_env(project_id, "Production")
    client.post(f"/api/projects/{project_id}/environments/{staging['id']}/default")
    assert client.delete(f"/api/projects/{project_id}/environments/{staging['id']}").status_code == 204
    envs = _envs(project_id)
    assert _defaults(envs) == [envs[0]["id"]]


def test_default_environment_helper_falls_back_to_oldest():
    oldest = EnvironmentSummary(id="a", projectId="p", name="A", baseUrl="https://a")
    newer = EnvironmentSummary(id="b", projectId="p", name="B", baseUrl="https://b")
    assert pick_default([oldest, newer]).id == "a"
    assert pick_default([oldest, newer.model_copy(update={"isDefault": True})]).id == "b"
    assert pick_default([]) is None


def test_row_without_the_column_reads_as_not_default():
    row = {"id": "1", "project_id": "p", "name": "Staging", "base_url": "https://s"}
    assert EnvironmentRepository()._map_row(row).isDefault is False


class _APIError(Exception):
    def __init__(self, message, code):
        super().__init__(message)
        self.code = code


def test_missing_column_detection():
    assert _is_missing_column(_APIError("Could not find the 'is_default' column of 'environments'", "PGRST204"))
    assert _is_missing_column(_APIError("column environments.is_default does not exist", "42703"))
    assert not _is_missing_column(_APIError("permission denied", "42501"))


class _UnmigratedRepository(EnvironmentRepository):
    """Demo storage, but flagging fails the way an unmigrated Supabase does."""

    def set_default_flag(self, project_id, environment_id):
        raise DefaultColumnMissing()


def test_without_migration_reads_work_and_setting_is_a_clear_409():
    project_id = _project()
    repo = _UnmigratedRepository()
    service = EnvironmentsService(repo, project_repository)
    staging = service.create(project_id, CreateEnvironmentDto(name="Staging", baseUrl="https://staging.example.com"))

    envs = service.list_for_project(project_id)
    assert not any(env.isDefault for env in envs)
    assert service.default_environment(project_id).id == envs[0].id  # oldest

    with pytest.raises(HTTPException) as exc:
        service.set_default(project_id, staging.id)
    assert exc.value.status_code == 409
    assert "20261009_default_environment.sql" in exc.value.detail


def test_environment_named_default_can_be_deleted_when_another_exists():
    project_id = _project()
    named_default = _envs(project_id)[0]
    assert named_default["name"] == "Default"
    staging = _create_env(project_id, "Staging")
    res = client.delete(f"/api/projects/{project_id}/environments/{named_default['id']}")
    assert res.status_code in (200, 204), res.text
    envs = _envs(project_id)
    # Not recreated by the next list, and the remaining one becomes the default.
    assert [env["id"] for env in envs] == [staging["id"]]
    assert _defaults(envs) == [staging["id"]]


def test_last_environment_cannot_be_deleted():
    project_id = _project()
    only = _envs(project_id)[0]
    res = client.delete(f"/api/projects/{project_id}/environments/{only['id']}")
    assert res.status_code == 400
    assert "at least one environment" in res.json()["message"]
