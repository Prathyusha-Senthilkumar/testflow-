# TestFlow - Execution Architecture

TestFlow is a QA platform that manages test projects, suites, auth profiles, and Playwright executions. The current architecture keeps the control plane in FastAPI and moves the actual Playwright execution to a Node.js worker that runs the JavaScript/TypeScript Playwright test.

## Architecture diagram

```text
Frontend / API Client
    |
    | POST /api/executions
    v
FastAPI Backend
    |
    v
Execution Queue
    |
    | queued job
    v
Node.js Worker
    |
    v
Docker Runner
    |
    v
Playwright Docker Container
    |
    v
Node.js Playwright Test
    |
    v
PASS / FAIL
    |
    v
FastAPI / Database
    |
    v
Test Results
```

## Current state of the repo

The project originally contained:

- a NestJS backend under backend/
- a Python automation framework under automation/
- no real queue or worker infrastructure
- no Node-based Playwright execution path
- no execution platform for queued job lifecycle

This update preserves the valid working project pieces, but changes the execution path so the real Playwright runner is Node.js-based and queued through the API.

## FastAPI setup

```powershell
cd c:\college_website_testing_framework
python -m pip install -r requirements.txt
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

## Node worker setup

```powershell
cd c:\college_website_testing_framework\worker
npm install
npm start
```

## Docker setup

```powershell
docker --version
cd c:\college_website_testing_framework\worker
docker build -t testflow-playwright .
```

The Docker runner is designed to create predictable names such as:

```text
testflow-exec-exec_123
```

## Queue setup

The repo had no Redis/RQ/Celery setup, so the queue is a lightweight in-project job store using JSON files stored in:

- backend/data/execution_queue.json
- backend/data/executions.json
- backend/data/results.json

This is a simple, reliable queue appropriate for the current repo without adding unnecessary infrastructure.

## Trigger an execution

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/executions -ContentType "application/json" -Body '{"test_case_id":"TC_LOGIN_001"}'
```

Sample response:

```json
{
  "execution_id": "exec_001",
  "status": "QUEUED"
}
```

## Monitor the queue and worker

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/worker/status
Invoke-RestMethod http://127.0.0.1:8000/api/executions/exec_001
Invoke-RestMethod http://127.0.0.1:8000/api/results/exec_001
```

## See running containers

```powershell
docker ps --filter "name=testflow-exec-"
```

## Check execution status

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/executions/exec_001
```

## Retrieve results

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/results/exec_001
Invoke-RestMethod http://127.0.0.1:8000/api/test-cases/TC_LOGIN_001/results
```

## End-to-end test

```powershell
cd c:\college_website_testing_framework
python -m pytest backend/tests/test_execution_api.py -q
cd worker
node --test
```

## Required API endpoints

- GET /api/health
- GET /api/worker/status
- POST /api/executions
- GET /api/executions/{execution_id}
- GET /api/results/{execution_id}
- GET /api/test-cases/{test_case_id}/results
- GET /api/containers
- GET /api/containers/{execution_id}

## Key files

- backend/main.py - FastAPI execution control plane
- backend/data/execution_queue.json - JSON queue file
- worker/src/worker.js - Node worker
- worker/src/docker-runner.js - Docker runner
- worker/src/queue-store.js - queue abstraction
- worker/src/runner.js - Playwright execution helper
- tests/playwright-js/login.spec.js - Node Playwright test
- auth/AUTH_STUDENT_001/storage-state.json - session storage profile

## Important note

Docker execution is implemented in the worker and runs the prebuilt `testflow-playwright:latest` image when Docker is available on the host. The image contains Node.js, the project dependencies, and the Chromium browser required by the JavaScript Playwright test.
