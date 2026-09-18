from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create_project(name: str = "Suite Test Project"):
    res = client.post("/api/projects", json={"name": name, "baseUrl": "https://example.com"})
    assert res.status_code == 200, res.text
    return res.json()["id"]


def _create_case(project_id: str, name: str, category: str, scenario: str):
    res = client.post(
        f"/api/projects/{project_id}/test-cases",
        json={"name": name, "category": category, "scenario": scenario},
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_suite_management_flow():
    project_id = _create_project()
    tc1 = _create_case(project_id, "Valid Login", "Functional", "Happy Path")
    tc2 = _create_case(project_id, "Invalid Login", "Functional", "Negative")
    tc3 = _create_case(project_id, "Mobile Navigation", "Responsive", "Happy Path")

    empty_name = client.post(
        f"/api/projects/{project_id}/test-suites",
        json={"name": "   "},
    )
    assert empty_name.status_code == 400

    suite1 = client.post(
        f"/api/projects/{project_id}/test-suites",
        json={"name": "Login Regression", "description": "Login flows"},
    )
    assert suite1.status_code == 200
    suite1_id = suite1.json()["id"]

    suite2 = client.post(
        f"/api/projects/{project_id}/test-suites",
        json={"name": "Smoke Tests"},
    )
    suite2_id = suite2.json()["id"]

    add1 = client.post(
        f"/api/projects/{project_id}/test-suites/{suite1_id}/test-cases",
        json={"testCaseIds": [tc1["id"], tc2["id"]]},
    )
    assert add1.status_code == 200
    assert len(add1.json()["testCases"]) == 2

    add2 = client.post(
        f"/api/projects/{project_id}/test-suites/{suite2_id}/test-cases",
        json={"testCaseIds": [tc1["id"], tc3["id"]]},
    )
    assert len(add2.json()["testCases"]) == 2

    dup = client.post(
        f"/api/projects/{project_id}/test-suites/{suite2_id}/test-cases",
        json={"testCaseIds": [tc1["id"]]},
    )
    assert len(dup.json()["testCases"]) == 2

    list_res = client.get(f"/api/projects/{project_id}/test-suites")
    counts = {item["id"]: item["caseCount"] for item in list_res.json()}
    assert counts[suite1_id] == 2
    assert counts[suite2_id] == 2

    remove = client.delete(
        f"/api/projects/{project_id}/test-suites/{suite1_id}/test-cases/{tc1['id']}"
    )
    assert len(remove.json()["testCases"]) == 1
    assert remove.json()["testCases"][0]["id"] == tc2["id"]

    smoke = client.get(f"/api/projects/{project_id}/test-suites/{suite2_id}")
    smoke_ids = {c["id"] for c in smoke.json()["testCases"]}
    assert tc1["id"] in smoke_ids and tc3["id"] in smoke_ids

    cases_after = client.get(f"/api/projects/{project_id}/test-cases")
    assert len(cases_after.json()) == 3

    other_project = _create_project("Other")
    other_case = _create_case(other_project, "Other Case", "Functional", "Happy Path")
    cross = client.post(
        f"/api/projects/{project_id}/test-suites/{suite2_id}/test-cases",
        json={"testCaseIds": [other_case["id"]]},
    )
    assert cross.status_code == 404

    patch = client.patch(
        f"/api/projects/{project_id}/test-suites/{suite1_id}",
        json={"name": "Login Regression Updated"},
    )
    assert patch.status_code == 200
    assert patch.json()["name"] == "Login Regression Updated"

    delete_suite = client.delete(f"/api/projects/{project_id}/test-suites/{suite1_id}")
    assert delete_suite.status_code == 204

    still_there = client.get(f"/api/projects/{project_id}/test-cases/{tc2['id']}")
    assert still_there.status_code == 200
