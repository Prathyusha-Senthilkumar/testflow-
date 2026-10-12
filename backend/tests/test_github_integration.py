"""GitHub integration: connect with an encrypted token, file issues for failed runs, PDF report."""

import struct
import zlib
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from auth_helpers import auth_headers
from app.integrations.github.client import GitHubError, GitHubToken
from app.main import app
from app.repositories.github_repository import GitHubRepository
from app.routers.github import get_github_service
from app.services.github_service import GitHubService

client = TestClient(app, headers=auth_headers())
TOKEN = "github_pat_" + "A1b2C3d4E5f6G7h8I9j0" * 3 + "ZZ9f"


def _png() -> bytes:
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    raw = b"\x00\xff\x00\x00"
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


class FakeGitHub:
    """Records calls. `fail` maps a method name to the GitHubError it raises."""

    def __init__(self):
        self.calls: list[tuple] = []
        self.files: dict[str, bytes] = {}
        self.issues: dict[int, dict] = {}
        self.comments: list[tuple[int, str]] = []
        self.fail: dict[str, GitHubError] = {}
        self.repo = {"name": "shop-web", "owner": {"login": "acme"}, "has_issues": True, "permissions": {"push": True}}
        self.tokens: list[str] = []

    def factory(self, token: GitHubToken, owner: str, repo: str):
        fake = self
        fake.tokens.append(token.reveal())

        class Client:
            def __init__(self):
                self.owner, self.repo = owner, repo

            def _check(self, name):
                fake.calls.append((name,))
                if name in fake.fail:
                    raise fake.fail[name]

            def get_repo(self):
                self._check("get_repo")
                return fake.repo

            def ensure_branch(self, branch):
                self._check("ensure_branch")

            def put_file(self, branch, path, content, message):
                self._check("put_file")
                fake.files[path] = content

            def file_url(self, branch, path):
                return f"https://github.com/{owner}/{repo}/blob/{branch}/{path}?raw=true"

            def create_issue(self, title, body, labels=None):
                self._check("create_issue")
                number = len(fake.issues) + 1
                fake.issues[number] = {"number": number, "title": title, "body": body, "state": "open",
                                       "html_url": f"https://github.com/{owner}/{repo}/issues/{number}"}
                return fake.issues[number]

            def get_issue(self, number):
                return fake.issues.get(number)

            def comment(self, number, body):
                self._check("comment")
                fake.comments.append((number, body))
                return {}

        return Client()


class FakeRuns:
    def __init__(self, folder: Path):
        self.folder = folder
        self.reports: dict[str, dict] = {}
        (folder / "step-01.png").write_bytes(_png())
        (folder / "step-02.png").write_bytes(_png())

    def add(self, run_id, project_id, case_id, status="Failed", minutes_ago=0):
        completed = (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()
        self.reports[run_id] = {
            "id": run_id, "projectId": project_id, "projectName": "Shop", "suiteName": "Checkout",
            "testCaseId": case_id, "testCaseCode": "TC-1", "testName": "Pay with card", "status": status,
            "startedAt": completed, "completedAt": completed, "durationMs": 4200,
            "errorMessage": "Expected 'Paid' to be visible", "runBy": "QA",
        }

    def get_report(self, run_id):
        return self.reports.get(run_id)

    def list_failed_since(self, since, limit=100):
        return sorted(
            (r for r in self.reports.values() if r["status"] == "Failed" and r["completedAt"] > since),
            key=lambda r: r["completedAt"],
        )[:limit]

    def screenshot_steps(self, run_id):
        return [
            {"file": "step-01.png", "label": "await page.goto('https://shop.test/cart');"},
            {"file": "step-02.png", "label": "await page.getByRole('button', { name: 'Pay' }).click();",
             "failed": True, "error": "Timeout waiting for Paid\nCall log: ..."},
        ]

    def screenshot_named(self, run_id, file_name):
        path = self.folder / file_name
        return path if path.is_file() else None


@pytest.fixture
def setup(tmp_path, monkeypatch):
    from cryptography.fernet import Fernet

    monkeypatch.setattr("app.config.settings.TESTFLOW_SECRET_KEY", Fernet.generate_key().decode())
    github = FakeGitHub()
    revoked: list[str] = []
    repo = GitHubRepository()
    runs = FakeRuns(tmp_path)
    service = GitHubService(repository=repo, runs=runs, client_factory=github.factory,
                            revoke=lambda token: revoked.append(token.reveal()))
    app.dependency_overrides[get_github_service] = lambda: service
    yield service, github, repo, runs, revoked
    app.dependency_overrides.pop(get_github_service, None)


def _project() -> str:
    res = client.post("/api/projects", json={"name": "GitHub Project", "baseUrl": "https://example.com"})
    assert res.status_code == 200, res.text
    return res.json()["id"]


def _connect(project_id: str, **extra):
    return client.put(f"/api/projects/{project_id}/github", json={"repo": "https://github.com/acme/shop-web.git", "token": TOKEN, **extra})


def test_connect_encrypts_token_and_never_returns_it(setup):
    service, github, repo, *_ = setup
    project_id = _project()
    res = _connect(project_id)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["connected"] and body["owner"] == "acme" and body["repo"] == "shop-web"
    assert body["tokenHint"] == "…ZZ9f"
    assert TOKEN not in res.text
    row = repo.get_connection(project_id)
    assert TOKEN not in str(row) and row["token_encrypted"] and row["token_hint"] == "…ZZ9f"
    assert TOKEN not in client.get(f"/api/projects/{project_id}/github").text
    assert repr(GitHubToken(TOKEN)) == "GitHubToken(…ZZ9f)"


def test_update_keeps_token_and_replace_swaps_it(setup):
    service, github, repo, *_ = setup
    project_id = _project()
    _connect(project_id)
    res = client.put(f"/api/projects/{project_id}/github", json={"repo": "acme/shop-web", "autoCreateIssues": False})
    assert res.status_code == 200, res.text
    assert res.json()["autoCreateIssues"] is False and github.tokens[-1] == TOKEN
    new_token = TOKEN[:-4] + "NEW1"
    res = client.put(f"/api/projects/{project_id}/github", json={"repo": "acme/shop-web", "token": new_token})
    assert res.json()["tokenHint"] == "…NEW1"
    assert service._token(repo.get_connection(project_id)).reveal() == new_token


@pytest.mark.parametrize(
    "error, expected",
    [
        (GitHubError(401, "GitHub returned 401: Bad credentials."), "expired, been revoked"),
        (GitHubError(404, "GitHub returned 404: Not Found."), "Only select repositories"),
        (GitHubError(403, "GitHub returned 403: Resource protected by organization SAML enforcement."), "single sign-on"),
    ],
)
def test_connect_explains_github_refusals(setup, error, expected):
    _, github, *_ = setup
    github.fail["get_repo"] = error
    res = _connect(_project())
    assert res.status_code == 400
    assert expected in res.json()["message"]


def test_connect_rejects_bad_input(setup):
    project_id = _project()
    assert client.put(f"/api/projects/{project_id}/github", json={"repo": "acme/shop-web"}).status_code == 400
    assert client.put(f"/api/projects/{project_id}/github", json={"repo": "not a repo", "token": TOKEN}).status_code == 400
    assert client.put(f"/api/projects/{project_id}/github", json={"repo": "acme/x", "token": "short"}).status_code == 400


def test_connect_without_secret_key_refuses_to_store(setup, monkeypatch):
    monkeypatch.setattr("app.config.settings.TESTFLOW_SECRET_KEY", None)
    res = _connect(_project())
    assert res.status_code == 409 and "TESTFLOW_SECRET_KEY" in res.json()["message"]


def test_disconnect_with_revoke(setup):
    _, _, repo, _, revoked = setup
    project_id = _project()
    _connect(project_id)
    res = client.delete(f"/api/projects/{project_id}/github?revoke=true")
    assert res.status_code == 200 and res.json()["revoked"] is True
    assert revoked == [TOKEN] and repo.get_connection(project_id) is None


def test_poll_files_issue_with_screenshots_then_comments_on_repeat(setup):
    service, github, repo, runs, _ = setup
    project_id = _project()
    _connect(project_id)
    runs.add("11111111-0000-0000-0000-000000000001", project_id, "case-1")
    runs.add("11111111-0000-0000-0000-000000000099", project_id, "case-1", minutes_ago=60)  # before connecting
    assert service.poll_once() == 1
    issue = github.issues[1]
    assert issue["title"] == "[Attest] TC-1: Pay with card failed"
    assert "Step 2: Click the Pay button" in issue["body"] and "blob/attest-reports/" in issue["body"]
    assert any(path.endswith(".pdf") for path in github.files) and sum(p.endswith(".png") for p in github.files) == 2
    assert service.poll_once() == 0  # already claimed

    runs.add("11111111-0000-0000-0000-000000000002", project_id, "case-1")
    assert service.poll_once() == 1
    assert len(github.issues) == 1 and github.comments and github.comments[0][0] == 1
    status = client.get("/api/test-runs/11111111-0000-0000-0000-000000000002/github-issue").json()
    assert status["connected"] and status["issue"]["number"] == 1 and status["issue"]["commented"]

    github.issues[1]["state"] = "closed"  # fixed and closed: the next failure opens a new issue
    runs.add("11111111-0000-0000-0000-000000000003", project_id, "case-1")
    service.poll_once()
    assert len(github.issues) == 2


def test_missing_contents_permission_still_files_issue_with_guidance(setup):
    service, github, _, runs, _ = setup
    project_id = _project()
    _connect(project_id)
    github.fail["ensure_branch"] = GitHubError(403, "GitHub returned 403: Resource not accessible by personal access token.")
    runs.add("22222222-0000-0000-0000-000000000001", project_id, "case-2")
    service.poll_once()
    body = github.issues[1]["body"]
    assert "Contents: Read and write" in body and "<img" not in body


def test_issue_permission_error_is_recorded_and_retry_works(setup):
    service, github, _, runs, _ = setup
    project_id = _project()
    _connect(project_id)
    github.fail["create_issue"] = GitHubError(403, "GitHub returned 403: Resource not accessible by personal access token.")
    run_id = "33333333-0000-0000-0000-000000000001"
    runs.add(run_id, project_id, "case-3")
    service.poll_once()
    status = client.get(f"/api/test-runs/{run_id}/github-issue").json()
    assert status["issue"]["state"] == "error" and "Issues: Read and write" in status["issue"]["error"]
    github.fail.clear()
    res = client.post(f"/api/test-runs/{run_id}/github-issue")
    assert res.status_code == 200 and res.json()["issue"]["state"] == "open"
    assert client.post(f"/api/test-runs/{run_id}/github-issue").json()["issue"]["number"] == 1  # no duplicate


def test_manual_issue_rejects_passing_runs(setup):
    _, _, _, runs, _ = setup
    project_id = _project()
    _connect(project_id)
    runs.add("44444444-0000-0000-0000-000000000001", project_id, "case-4", status="Passed")
    assert client.post("/api/test-runs/44444444-0000-0000-0000-000000000001/github-issue").status_code == 400


def test_pdf_report(setup):
    _, _, _, runs, _ = setup
    runs.add("55555555-0000-0000-0000-000000000001", "p", "case-5")
    res = client.get("/api/test-runs/55555555-0000-0000-0000-000000000001/report.pdf")
    assert res.status_code == 200 and res.content.startswith(b"%PDF")
    assert "Attest_pay-with-card_55555555.pdf" in res.headers["content-disposition"]
