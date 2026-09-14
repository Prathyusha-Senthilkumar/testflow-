import time
import urllib.request
import urllib.error
import json

BASE_URL = "http://localhost:3000/api"

def make_request(url, method="GET", data=None):
    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode("utf-8")
            return resp.status, json.loads(content)
    except urllib.error.HTTPError as e:
        content = e.read().decode("utf-8")
        try:
            return e.code, json.loads(content)
        except Exception:
            return e.code, {"raw": content}

def run_tests():
    print("Waiting for server to be ready...")
    time.sleep(2)

    print("\n--- Test 1: Root endpoint ---")
    status, res = make_request("http://localhost:3000/")
    print(f"Status: {status}, Response: {res}")
    assert status == 200

    print("\n--- Test 2: GET /api/dashboard ---")
    status, res = make_request(f"{BASE_URL}/dashboard")
    print(f"Status: {status}, Response: {json.dumps(res, indent=2)}")
    assert status == 200
    assert "projects" in res
    assert "testCases" in res
    assert "passed" in res
    assert "failed" in res
    assert "recentProjects" in res

    print("\n--- Test 3: GET /api/projects ---")
    status, res = make_request(f"{BASE_URL}/projects")
    print(f"Status: {status}, Response: {json.dumps(res, indent=2)}")
    assert status == 200
    assert isinstance(res, list)
    assert len(res) > 0
    assert res[0]["id"] == "demo-project"
    assert "baseUrl" in res[0]
    assert "passRate" in res[0]

    print("\n--- Test 4: GET /api/projects/demo-project ---")
    status, res = make_request(f"{BASE_URL}/projects/demo-project")
    print(f"Status: {status}, Response: {json.dumps(res, indent=2)}")
    assert status == 200
    assert res["id"] == "demo-project"
    assert "suitesList" in res
    assert len(res["suitesList"]) == 3
    assert res["suitesList"][0]["id"] == "demo-suite-1"

    print("\n--- Test 5: GET /api/projects/non-existent (404 Error) ---")
    status, res = make_request(f"{BASE_URL}/projects/invalid-id")
    print(f"Status: {status}, Response: {res}")
    assert status == 404
    assert res.get("message") == "Project not found"

    print("\n--- Test 6: POST /api/projects with invalid URL (400 Error) ---")
    invalid_dto = {"name": "Invalid Proj", "baseUrl": "not-a-url"}
    status, res = make_request(f"{BASE_URL}/projects", method="POST", data=invalid_dto)
    print(f"Status: {status}, Response: {res}")
    assert status == 400
    assert "message" in res

    print("\n--- Test 7: POST /api/projects with missing name (400 Error) ---")
    invalid_dto_2 = {"name": "   ", "baseUrl": "https://example.com"}
    status, res = make_request(f"{BASE_URL}/projects", method="POST", data=invalid_dto_2)
    print(f"Status: {status}, Response: {res}")
    assert status == 400
    assert res.get("message") == "Project name is required"

    print("\n--- Test 8: POST /api/projects (Valid Creation) ---")
    valid_dto = {
        "name": "New Automated Project",
        "baseUrl": "https://my-app.example.com",
        "description": "Test description"
    }
    status, res = make_request(f"{BASE_URL}/projects", method="POST", data=valid_dto)
    print(f"Status: {status}, Response: {json.dumps(res, indent=2)}")
    assert status in (200, 201)
    new_id = res["id"]
    assert res["name"] == "New Automated Project"
    assert res["baseUrl"] == "https://my-app.example.com/" or res["baseUrl"] == "https://my-app.example.com"
    assert res["description"] == "Test description"

    print("\n--- Test 9: PATCH /api/projects/{id} ---")
    update_dto = {"name": "Updated Project Name"}
    status, res = make_request(f"{BASE_URL}/projects/{new_id}", method="PATCH", data=update_dto)
    print(f"Status: {status}, Response: {json.dumps(res, indent=2)}")
    assert status == 200
    assert res["name"] == "Updated Project Name"

    print("\n--- Test 10: Verify Dashboard count updated after creation ---")
    status, res = make_request(f"{BASE_URL}/dashboard")
    print(f"Status: {status}, Dashboard projects count: {res['projects']}")
    assert res["projects"] >= 2

    print("\n================ ALL TESTS PASSED SUCCESSFULLY ================\n")

if __name__ == "__main__":
    run_tests()
