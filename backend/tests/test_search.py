"""GET /api/search in demo mode (in-memory repositories, no Supabase)."""

import uuid

import pytest
from fastapi.testclient import TestClient

from auth_helpers import auth_headers

from app.database import get_supabase_client
from app.main import app
from app.repositories.project_repository import project_repository
from app.repositories.search_repository import search_repository
from app.repositories.test_case_repository import test_case_repository
from app.repositories.test_suite_repository import test_suite_repository
from app.schemas import project as project_schema
from app.schemas import test_case as case_schema
from app.schemas import test_suite as suite_schema

client = TestClient(app, headers=auth_headers())


@pytest.fixture(autouse=True)
def _demo_only():
    # backend/.env points at a live database; these tests must never reach it.
    assert get_supabase_client() is None, "run with USE_DEMO_DATA=true and Supabase disabled"
    yield


@pytest.fixture
def seed():
    """Seed demo repositories with unique ids and remove everything afterwards."""
    created = {"projects": [], "runs": []}

    def project(name: str, base_url: str = "https://example.com") -> str:
        pid = f"search-proj-{uuid.uuid4().hex[:8]}"
        project_repository.demo_projects[pid] = project_schema.ProjectDetail(
            id=pid, name=name, baseUrl=base_url, suites=0, cases=0, passed=0, failed=0,
            passRate=0, suitesList=[],
        )
        created["projects"].append(pid)
        return pid

    def suite(project_id: str, name: str) -> str:
        sid = f"search-suite-{uuid.uuid4().hex[:8]}"
        test_suite_repository.demo_suites.setdefault(project_id, []).append(
            suite_schema.TestSuiteSummary(id=sid, projectId=project_id, name=name, createdAt="2026-10-01T10:00:00+00:00")
        )
        test_suite_repository.demo_suite_cases[f"{project_id}:{sid}"] = set()
        return sid

    def case(project_id: str, name: str, code: str = "", suite_id: str | None = None) -> str:
        cid = f"search-case-{uuid.uuid4().hex[:8]}"
        test_case_repository.demo_cases.setdefault(project_id, []).append(
            case_schema.TestCaseSummary(id=cid, code=code or f"TC-{len(test_case_repository.demo_cases[project_id]) + 1:03d}",
                            name=name, automationStatus="Not Configured")
        )
        if suite_id:
            test_suite_repository.demo_suite_cases[f"{project_id}:{suite_id}"].add(cid)
        return cid

    def run(test_case_id: str, status: str, started_at: str, error_message: str | None = None) -> str:
        rid = f"search-run-{uuid.uuid4().hex[:8]}"
        search_repository.demo_runs.append({
            "id": rid, "test_case_id": test_case_id, "status": status,
            "started_at": started_at, "completed_at": started_at, "error_message": error_message,
        })
        created["runs"].append(rid)
        return rid

    yield type("Seed", (), {"project": staticmethod(project), "suite": staticmethod(suite),
                            "case": staticmethod(case), "run": staticmethod(run)})

    for pid in created["projects"]:
        project_repository.demo_projects.pop(pid, None)
        test_case_repository.demo_cases.pop(pid, None)
        test_suite_repository.demo_suites.pop(pid, None)
        for key in [k for k in test_suite_repository.demo_suite_cases if k.startswith(f"{pid}:")]:
            test_suite_repository.demo_suite_cases.pop(key)
    search_repository.demo_runs[:] = [r for r in search_repository.demo_runs if r["id"] not in created["runs"]]


def _search(**params):
    return client.get("/api/search", params=params)


@pytest.mark.parametrize("q", ["", "a", "  a  "])
def test_query_too_short_is_400(q):
    res = _search(q=q)
    assert res.status_code == 400
    assert res.json() == {"message": "Type at least 2 characters to search."}


def test_requires_sign_in():
    res = TestClient(app).get("/api/search", params={"q": "login"})
    assert res.status_code == 401


def test_invalid_type_and_limit_are_400():
    assert _search(q="login", type="story").status_code == 400
    assert _search(q="login", limit=0).status_code == 400
    assert _search(q="login", limit=51).status_code == 400


def test_all_types_grouped_and_empty_groups_omitted(seed):
    pid = seed.project("Zephyrine Portal", "https://zephyrine.example.com")
    sid = seed.suite(pid, "Zephyrine Checkout")
    cid = seed.case(pid, "Zephyrine login", code="TC-012", suite_id=sid)
    seed.case(pid, "Unrelated", suite_id=sid)

    res = _search(q="  zephyrine ")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["query"] == "zephyrine"
    assert body["type"] == "all"
    assert [g["type"] for g in body["groups"]] == ["project", "suite", "test_case"]  # no runs -> omitted
    project, suite, case = body["groups"]
    assert project["label"] == "Projects" and project["total"] == 1
    assert project["items"][0] == {
        "id": pid, "type": "project", "title": "Zephyrine Portal",
        "subtitle": "https://zephyrine.example.com", "projectId": pid,
        "projectName": "Zephyrine Portal", "status": None, "updatedAt": None, "testCaseId": None,
    }
    assert suite["label"] == "Test suites"
    assert suite["items"][0]["subtitle"] == "Zephyrine Portal · 2 cases"
    assert case["label"] == "Test cases"
    assert case["items"][0]["id"] == cid
    assert case["items"][0]["subtitle"] == "TC-012 · Zephyrine Checkout · Zephyrine Portal"

    # Matching only a case code leaves a single group.
    only_cases = _search(q="TC-012", projectId=pid).json()
    assert [g["type"] for g in only_cases["groups"]] == ["test_case"]


def test_single_type_with_limit(seed):
    pid = seed.project("Limit Project")
    for i in range(4):
        seed.case(pid, f"Quokkalimit case {i}")
    body = _search(q="quokkalimit", type="test_case", limit=2).json()
    assert len(body["groups"]) == 1
    group = body["groups"][0]
    assert group["type"] == "test_case"
    assert group["total"] == 4
    assert len(group["items"]) == 2

    # A single type returns its group even when empty.
    empty = _search(q="quokkalimit", type="suite").json()
    assert empty["groups"] == [{"type": "suite", "label": "Test suites", "total": 0, "items": []}]


def test_ranking_exact_then_prefix_then_contains(seed):
    pid = seed.project("Ranking Project")
    contains = seed.case(pid, "Open the Wombatrank page")
    prefix = seed.case(pid, "Wombatrank with filters")
    exact = seed.case(pid, "wombatrank")
    body = _search(q="WombatRank", type="test_case").json()
    assert [item["id"] for item in body["groups"][0]["items"]] == [exact, prefix, contains]


def test_like_wildcards_are_escaped(seed):
    pid = seed.project("Escape Project")
    pct = seed.case(pid, "Discount 100% applied")
    seed.case(pid, "Discount 1000 applied")
    under = seed.case(pid, "snake_case flow")
    seed.case(pid, "snakeXcase flow")

    pct_items = _search(q="100%", type="test_case", projectId=pid).json()["groups"][0]["items"]
    assert [i["id"] for i in pct_items] == [pct]
    under_items = _search(q="snake_", type="test_case", projectId=pid).json()["groups"][0]["items"]
    assert [i["id"] for i in under_items] == [under]


def test_project_filter(seed):
    a = seed.project("Ocelot Alpha")
    b = seed.project("Ocelot Beta")
    sa = seed.suite(a, "Ocelot suite")
    seed.suite(b, "Ocelot suite")
    ca = seed.case(a, "Ocelot flow", suite_id=sa)
    seed.case(b, "Ocelot flow")

    unscoped = {g["type"]: g for g in _search(q="ocelot").json()["groups"]}
    assert unscoped["project"]["total"] == 2
    assert unscoped["test_case"]["total"] == 2

    scoped = {g["type"]: g for g in _search(q="ocelot", projectId=a).json()["groups"]}
    assert [i["id"] for i in scoped["project"]["items"]] == [a]
    assert [i["projectId"] for i in scoped["suite"]["items"]] == [a]
    assert [i["id"] for i in scoped["test_case"]["items"]] == [ca]
    assert scoped["test_case"]["total"] == 1


def test_runs_by_case_name_and_status_keyword(seed):
    pid = seed.project("Run Project")
    other = seed.project("Other Run Project")
    cid = seed.case(pid, "Checkout gecko flow", code="TC-007")
    other_cid = seed.case(other, "Unrelated")
    older = seed.run(cid, "Passed", "2026-10-01T09:00:00+00:00")
    newer = seed.run(cid, "Failed", "2026-10-02T14:03:00+00:00")
    cancelled = seed.run(cid, "Not Run", "2026-10-03T08:00:00+00:00", error_message="Cancelled")
    seed.run(other_cid, "Failed", "2026-10-04T08:00:00+00:00")

    by_name = _search(q="gecko", type="run").json()["groups"][0]
    assert [i["id"] for i in by_name["items"]] == [cancelled, newer, older]
    item = by_name["items"][1]
    assert item["title"] == "Checkout gecko flow"
    assert item["subtitle"] == "Failed · 2 Oct 14:03 · Run Project"
    assert item["status"] == "failed"
    assert item["testCaseId"] == cid
    assert by_name["items"][0]["status"] == "cancelled"

    by_status = _search(q="failed", type="run", projectId=pid).json()["groups"][0]
    assert [i["id"] for i in by_status["items"]] == [newer]

    # Latest run status is attached to test case results.
    case_item = _search(q="gecko", type="test_case").json()["groups"][0]["items"][0]
    assert case_item["status"] == "cancelled"
