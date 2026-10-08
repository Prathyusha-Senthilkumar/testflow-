"""Notifications API in demo mode, plus the missing-table fallback against a fake Supabase client."""

import logging
import uuid

import pytest
from fastapi.testclient import TestClient

from auth_helpers import TEST_USER_ID, auth_headers

from app.main import app
from app.repositories.notification_repository import NotificationRepository, notification_repository
from app.services.notifications_service import notifications_service

OTHER_USER_ID = str(uuid.UUID("22222222-2222-2222-2222-222222222222"))

client = TestClient(app, headers=auth_headers())
other = TestClient(app, headers=auth_headers(sub=OTHER_USER_ID))


@pytest.fixture(autouse=True)
def _clean_store():
    notification_repository.reset_demo()
    yield
    notification_repository.reset_demo()


def _inject(user_id: str = TEST_USER_ID, n: int = 1, **overrides):
    created = []
    for index in range(n):
        fields = {
            "type": "run_failed",
            "severity": "error",
            "title": f"Test failed: Case {index}",
            "body": "Expected text 'Welcome' to be visible",
            "link": f"/projects/p1/results/run-{index}",
            "project_id": "p1",
            "entity_type": "test_run",
            "entity_id": f"run-{index}",
            "dedupe_key": f"run:{uuid.uuid4()}",
        }
        fields.update(overrides)
        created.append(notifications_service.notify(user_id, **fields))
    return created


def test_requires_token():
    bare = TestClient(app)
    for method, path in [
        ("get", "/api/notifications"),
        ("get", "/api/notifications/unread-count"),
        ("post", "/api/notifications/read-all"),
        ("get", "/api/notifications/preferences"),
    ]:
        res = getattr(bare, method)(path)
        assert res.status_code == 401, path
        assert res.json() == {"message": "Sign in required."}


def test_list_shape_and_unread_count():
    _inject(n=3)
    res = client.get("/api/notifications")
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["unreadCount"] == 3
    assert data["nextCursor"] is None
    assert [item["title"] for item in data["items"]] == [
        "Test failed: Case 2",
        "Test failed: Case 1",
        "Test failed: Case 0",
    ]
    item = data["items"][0]
    assert set(item) == {
        "id", "type", "severity", "title", "body", "link", "projectId",
        "entityType", "entityId", "read", "createdAt",
    }
    assert item["read"] is False and item["link"].startswith("/projects/")
    assert client.get("/api/notifications/unread-count").json() == {"unreadCount": 3}


def test_pagination_cursor():
    _inject(n=5)
    first = client.get("/api/notifications", params={"limit": 2}).json()
    assert len(first["items"]) == 2 and first["nextCursor"]
    second = client.get("/api/notifications", params={"limit": 2, "before": first["nextCursor"]}).json()
    third = client.get("/api/notifications", params={"limit": 2, "before": second["nextCursor"]}).json()
    assert third["nextCursor"] is None
    titles = [i["title"] for page in (first, second, third) for i in page["items"]]
    assert titles == [f"Test failed: Case {n}" for n in (4, 3, 2, 1, 0)]

    bad = client.get("/api/notifications", params={"before": "yesterday"})
    assert bad.status_code == 400 and "before" in bad.json()["message"]


def test_read_read_all_unread_only_and_delete():
    items = _inject(n=3)
    res = client.post(f"/api/notifications/{items[0].id}/read")
    assert res.status_code == 200 and res.json() == {"unreadCount": 2}
    # Reading twice is fine.
    assert client.post(f"/api/notifications/{items[0].id}/read").json() == {"unreadCount": 2}

    unread = client.get("/api/notifications", params={"unreadOnly": "true"}).json()
    assert {i["id"] for i in unread["items"]} == {items[1].id, items[2].id}

    res = client.post("/api/notifications/read-all")
    assert res.json() == {"updated": 2, "unreadCount": 0}
    assert all(i["read"] for i in client.get("/api/notifications").json()["items"])

    assert client.delete(f"/api/notifications/{items[1].id}").status_code == 204
    assert client.delete(f"/api/notifications/{items[1].id}").status_code == 404
    assert len(client.get("/api/notifications").json()["items"]) == 2

    missing = client.post(f"/api/notifications/{uuid.uuid4()}/read")
    assert missing.status_code == 404 and missing.json() == {"message": "Notification not found."}
    assert client.post("/api/notifications/not-a-uuid/read").status_code == 404


def test_mark_unread():
    items = _inject(n=2)
    client.post("/api/notifications/read-all")
    res = client.post(f"/api/notifications/{items[0].id}/unread")
    assert res.status_code == 200 and res.json() == {"unreadCount": 1}
    listed = {i["id"]: i["read"] for i in client.get("/api/notifications").json()["items"]}
    assert listed == {items[0].id: False, items[1].id: True}
    # Idempotent.
    assert client.post(f"/api/notifications/{items[0].id}/unread").json() == {"unreadCount": 1}
    # Other users and unknown ids get 404, and nothing changes.
    assert other.post(f"/api/notifications/{items[1].id}/unread").status_code == 404
    assert client.post(f"/api/notifications/{uuid.uuid4()}/unread").status_code == 404
    assert client.post("/api/notifications/nope/unread").status_code == 404
    assert client.get("/api/notifications/unread-count").json() == {"unreadCount": 1}


def test_users_only_see_their_own():
    mine = _inject(TEST_USER_ID, n=2)
    theirs = _inject(OTHER_USER_ID, n=1, title="Other user's failure")

    assert client.get("/api/notifications").json()["unreadCount"] == 2
    other_list = other.get("/api/notifications").json()
    assert [i["title"] for i in other_list["items"]] == ["Other user's failure"]

    # Another user's id behaves like a missing notification.
    assert other.post(f"/api/notifications/{mine[0].id}/read").status_code == 404
    assert other.delete(f"/api/notifications/{mine[0].id}").status_code == 404
    other.post("/api/notifications/read-all")
    assert client.get("/api/notifications/unread-count").json() == {"unreadCount": 2}
    assert client.delete(f"/api/notifications/{theirs[0].id}").status_code == 404


def test_dedupe_key_and_link_rules():
    first = notifications_service.notify(
        TEST_USER_ID, type="run_failed", severity="error", title="t", dedupe_key="run:abc"
    )
    again = notifications_service.notify(
        TEST_USER_ID, type="run_failed", severity="error", title="t", dedupe_key="run:abc"
    )
    assert first is not None and again is None
    with pytest.raises(ValueError):
        notifications_service.notify(TEST_USER_ID, type="system", severity="info", title="t", link="https://evil.example")


def test_preferences_defaults_update_and_gating():
    res = client.get("/api/notifications/preferences")
    assert res.json() == {"runFailed": True, "runPassed": False, "batchCompleted": True, "runStuck": True}

    # run_passed is off by default.
    assert notifications_service.notify(TEST_USER_ID, type="run_passed", severity="success", title="ok") is None

    res = client.put("/api/notifications/preferences", json={"runPassed": True, "runFailed": False})
    assert res.status_code == 200
    assert res.json() == {"runFailed": False, "runPassed": True, "batchCompleted": True, "runStuck": True}
    assert client.get("/api/notifications/preferences").json()["runPassed"] is True
    # Other users keep the defaults.
    assert other.get("/api/notifications/preferences").json()["runPassed"] is False

    assert notifications_service.notify(TEST_USER_ID, type="run_passed", severity="success", title="ok")
    assert notifications_service.notify(TEST_USER_ID, type="run_failed", severity="error", title="x") is None
    # Types without a preference are always delivered.
    assert notifications_service.notify(TEST_USER_ID, type="system", severity="info", title="hello")

    bad = client.put("/api/notifications/preferences", json={"runPassed": "maybe"})
    assert bad.status_code == 400
    unknown = client.put("/api/notifications/preferences", json={"email": True})
    assert unknown.status_code == 400


class _MissingTableError(Exception):
    code = "PGRST205"


class _FakeQuery:
    def __init__(self, calls):
        self.calls = calls

    def __getattr__(self, _name):
        return lambda *args, **kwargs: self

    def execute(self):
        self.calls.append("execute")
        raise _MissingTableError("Could not find the table 'public.notifications' in the schema cache")


class _FakeClient:
    def __init__(self):
        self.calls: list = []

    def from_(self, _table):
        return _FakeQuery(self.calls)


def test_missing_table_returns_empty_and_logs_once(monkeypatch, caplog):
    fake = _FakeClient()

    class _LiveRepo(NotificationRepository):
        @property
        def db(self):
            return fake

    monkeypatch.setattr(notifications_service, "repository", _LiveRepo())
    caplog.set_level(logging.WARNING, logger="testflow.notifications")

    res = client.get("/api/notifications")
    assert res.status_code == 200
    assert res.json() == {"items": [], "unreadCount": 0, "nextCursor": None}
    assert client.get("/api/notifications/unread-count").json() == {"unreadCount": 0}
    assert client.post("/api/notifications/read-all").json() == {"updated": 0, "unreadCount": 0}
    assert client.get("/api/notifications/preferences").json()["runFailed"] is True
    assert client.post(f"/api/notifications/{uuid.uuid4()}/read").status_code == 404
    assert client.post(f"/api/notifications/{uuid.uuid4()}/unread").status_code == 404

    # Detected once per table, then served from the cached flag without hitting the DB.
    assert len(fake.calls) == 2  # notifications + notification_preferences
    warnings = [r for r in caplog.records if "notifications_table_missing" in r.getMessage()]
    assert len(warnings) == 2


def test_bare_404_from_postgrest_counts_as_missing_table():
    """HEAD/count on an unmigrated table comes back as code 404 'JSON could not be generated'."""
    from postgrest.exceptions import APIError

    from app.repositories.notification_repository import _is_missing_table

    exc = APIError({"message": "JSON could not be generated", "code": 404, "hint": None, "details": "b''"})
    assert _is_missing_table(exc)
    assert not _is_missing_table(APIError({"message": "permission denied", "code": "42501", "hint": None, "details": None}))
