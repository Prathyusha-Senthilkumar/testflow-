"""Auth Profile secrets: strict key rules, explicit decrypt errors, no plaintext session left on disk."""

import json
import stat

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException

from app.config import settings
from app.repositories.auth_profile_repository import AuthProfileRepository
from app.services import secret_store


class _Table:
    def __init__(self, rows, updates):
        self.rows = rows
        self.updates = updates
        self._update = None

    def select(self, *_):
        return self

    def eq(self, *_):
        return self

    def limit(self, *_):
        return self

    def update(self, payload):
        self._update = payload
        return self

    def execute(self):
        if self._update is not None:
            self.updates.append(self._update)
            self.rows[0].update(self._update)
        return type("Res", (), {"data": list(self.rows)})()


class _Client:
    def __init__(self, row):
        self.rows = [row]
        self.updates: list[dict] = []

    def from_(self, _table):
        return _Table(self.rows, self.updates)


@pytest.fixture
def supabase_repo(tmp_path, monkeypatch):
    repo = AuthProfileRepository(root=tmp_path)
    row = {
        "id": "auth-1",
        "project_id": "proj-1",
        "name": "Admin",
        "login_url": "https://app.test/login",
        "refresh": None,
        "credentials_enc": None,
        "storage_state_enc": secret_store.encrypt_mapping({"cookies": [{"name": "sid", "value": "1"}], "origins": []}),
        "created_at": "2026-10-01T00:00:00+00:00",
    }
    client = _Client(row)
    monkeypatch.setattr(repo, "_client", lambda: client)
    return repo, client, tmp_path


def test_session_file_is_private_and_always_deleted(supabase_repo):
    repo, _, root = supabase_repo
    with repo.session_file("proj-1", "auth-1", load=True) as path:
        assert stat.S_IMODE(path.stat().st_mode) == 0o600
        assert json.loads(path.read_text())["cookies"][0]["name"] == "sid"
        assert path.name != "storage_state.json"
    assert not path.exists()
    assert not list(root.rglob("storage_state*.json"))


def test_session_file_is_deleted_on_error(supabase_repo):
    repo, _, root = supabase_repo
    with pytest.raises(RuntimeError):
        with repo.session_file("proj-1", "auth-1") as path:
            raise RuntimeError("codegen crashed")
    assert not path.exists()


def test_session_file_saves_changed_state_encrypted(supabase_repo):
    repo, client, _ = supabase_repo
    with repo.session_file("proj-1", "auth-1", load=False, save=True) as path:
        path.write_text(json.dumps({"cookies": [{"name": "new", "value": "2"}], "origins": []}))
    assert len(client.updates) == 1
    token = client.updates[0]["storage_state_enc"]
    assert "new" not in token
    assert secret_store.decrypt_mapping(token)["cookies"][0]["name"] == "new"


def test_unchanged_session_is_not_rewritten(supabase_repo):
    repo, client, _ = supabase_repo
    with repo.session_file("proj-1", "auth-1", load=True, save=True):
        pass
    assert client.updates == []


def test_wrong_key_is_an_explicit_error_not_no_session(supabase_repo, monkeypatch):
    repo, client, _ = supabase_repo
    monkeypatch.setattr(settings, "TESTFLOW_SECRET_KEY", Fernet.generate_key().decode())
    with pytest.raises(HTTPException) as exc:
        repo.read_storage_state("proj-1", "auth-1")
    assert exc.value.status_code == 500
    assert "TESTFLOW_SECRET_KEY" in exc.value.detail
    summary = repo._from_row(client.rows[0])
    assert summary.sessionStatus == "expired"
    assert summary.needsRenewal is True


def test_missing_key_never_falls_back_to_service_role(monkeypatch):
    monkeypatch.setattr(settings, "TESTFLOW_SECRET_KEY", None)
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "service-role-secret")
    with pytest.raises(secret_store.SecretUnavailableError):
        secret_store.encrypt_mapping({"a": 1})
    legacy = secret_store._legacy_fernet().encrypt(b'{"a":1}').decode()
    with pytest.raises(secret_store.SecretUnavailableError):
        secret_store.decrypt_mapping(legacy)
    # Only the explicit re-key path may read legacy tokens.
    assert secret_store.decrypt_mapping_legacy(legacy) == {"a": 1}
    assert secret_store.try_decrypt_mapping(legacy) is None
