from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / 'backend' / 'data'
DATA_DIR.mkdir(parents=True, exist_ok=True)
EXECUTIONS_PATH = DATA_DIR / 'executions.json'
RESULTS_PATH = DATA_DIR / 'results.json'
QUEUE_PATH = DATA_DIR / 'execution_queue.json'
QUEUE_LOCK_PATH = DATA_DIR / 'execution_queue.lock'
AUTH_DIR = ROOT / 'auth'
ARTIFACTS_DIR = ROOT / 'artifacts' / 'executions'


class ExecutionCreateRequest(BaseModel):
    test_case_id: str
    auth_profile_id: Optional[str] = None


class ExecutionRecord(BaseModel):
    execution_id: str
    test_case_id: str
    auth_profile_id: Optional[str] = None
    status: str = 'QUEUED'
    created_at: str | None = None
    updated_at: str | None = None


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding='utf-8')


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return default


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_state() -> Dict[str, Any]:
    state = _read_json(EXECUTIONS_PATH, {})
    if not isinstance(state, dict):
        return {}
    return state


def _save_state(state: Dict[str, Any]) -> None:
    _write_json(EXECUTIONS_PATH, state)


def _load_queue() -> list[dict]:
    queue = _read_json(QUEUE_PATH, [])
    if not isinstance(queue, list):
        return []
    return queue


def _save_queue(queue: list[dict]) -> None:
    _write_json(QUEUE_PATH, queue)


@contextmanager
def _queue_lock():
    acquired = False
    for _ in range(100):
        try:
            fd = os.open(str(QUEUE_LOCK_PATH), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode('utf-8'))
            os.close(fd)
            acquired = True
            try:
                yield
            finally:
                QUEUE_LOCK_PATH.unlink(missing_ok=True)
            return
        except FileExistsError:
            time.sleep(0.02)
    if not acquired:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail='Execution queue is busy',
        )


def _normalize_queue_job(job: Any) -> Optional[dict]:
    if not isinstance(job, dict):
        return None
    execution_id = job.get('execution_id')
    test_case_id = job.get('test_case_id')
    if not execution_id or not test_case_id:
        return None
    return {
        'execution_id': execution_id,
        'test_case_id': test_case_id,
        'auth_profile_id': job.get('auth_profile_id'),
    }


def _load_results() -> Dict[str, Any]:
    results = _read_json(RESULTS_PATH, {})
    if not isinstance(results, dict):
        return {}
    return results


def _save_results(results: Dict[str, Any]) -> None:
    _write_json(RESULTS_PATH, results)


def _valid_test_case(test_case_id: str) -> bool:
    VALID_CASES = {'TC_LOGIN_001', 'TC_LOGIN_002', 'TC_DASHBOARD_001'}
    return test_case_id in VALID_CASES


AUTH_PROFILE_ID_PATTERN = re.compile(r'^[A-Za-z0-9_-]+$')


def _valid_auth_profile(auth_profile_id: Optional[str]) -> bool:
    if auth_profile_id is None:
        return True
    if not auth_profile_id or not AUTH_PROFILE_ID_PATTERN.match(auth_profile_id):
        return False
    profile_dir = AUTH_DIR / auth_profile_id
    return profile_dir.exists() and (profile_dir / 'storage-state.json').exists()


app = FastAPI(title='TestFlow API', version='1.0.0')


@app.get('/api/health')
def health() -> dict:
    return {'status': 'ok'}


@app.get('/api/worker/status')
def worker_status() -> dict:
    return {
        'status': 'running',
        'worker_type': 'node',
        'queue': 'execution',
    }


@app.get('/api/containers')
def list_containers() -> dict:
    if shutil.which('docker') is None:
        return {'containers': []}

    try:
        result = subprocess.run(
            [
                'docker', 'ps',
                '--filter', 'name=testflow-exec-',
                '--format', '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}',
            ],
            capture_output=True,
            text=True,
            check=False,
        )
    except Exception:
        return {'containers': []}

    containers = []
    if result.stdout:
        for line in result.stdout.strip().splitlines():
            parts = line.split('\t')
            if len(parts) < 4:
                continue
            container_id, name, image, status = parts[:4]
            execution_id = name.replace('testflow-exec-', '') if name.startswith('testflow-exec-') else None
            containers.append({
                'container_id': container_id,
                'name': name,
                'execution_id': execution_id,
                'status': 'running' if 'Up' in status else 'stopped',
                'image': image,
            })
    return {'containers': containers}


@app.get('/api/containers/{execution_id}')
def get_container(execution_id: str) -> dict:
    containers = list_containers()['containers']
    match = next((item for item in containers if item.get('execution_id') == execution_id), None)
    if not match:
        return {'execution_id': execution_id, 'container': None}
    return {'execution_id': execution_id, 'container': match}


@app.post('/api/executions')
def create_execution(request: ExecutionCreateRequest) -> dict:
    if not _valid_test_case(request.test_case_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Test case not found')
    if not _valid_auth_profile(request.auth_profile_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Invalid auth profile')

    execution_id = f"exec_{len(_load_state()) + 1:03d}"
    timestamp = _now_iso()
    record = {
        'execution_id': execution_id,
        'test_case_id': request.test_case_id,
        'auth_profile_id': request.auth_profile_id,
        'status': 'QUEUED',
        'created_at': timestamp,
        'updated_at': timestamp,
    }

    state = _load_state()
    state[execution_id] = record
    _save_state(state)

    job = {
        'execution_id': execution_id,
        'test_case_id': request.test_case_id,
        'auth_profile_id': request.auth_profile_id,
    }
    with _queue_lock():
        queue = _load_queue()
        queue.append(job)
        _save_queue(queue)

    return {'execution_id': execution_id, 'status': 'QUEUED'}


@app.get('/api/executions/queue')
def get_execution_queue() -> dict:
    with _queue_lock():
        queue = _load_queue()
    jobs = [_normalize_queue_job(item) for item in queue]
    return {'queue': [job for job in jobs if job]}


@app.get('/api/executions/{execution_id}')
def get_execution(execution_id: str) -> dict:
    record = _load_state().get(execution_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Execution not found')
    return {
        'execution_id': record['execution_id'],
        'test_case_id': record['test_case_id'],
        'status': record['status'],
        'auth_profile_id': record.get('auth_profile_id'),
    }


@app.get('/api/results/{execution_id}')
def get_result(execution_id: str) -> dict:
    results = _load_results().get(execution_id)
    if not results:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Result not found')
    return results


@app.get('/api/test-cases/{test_case_id}/results')
def get_case_results(test_case_id: str) -> dict:
    results = _load_results()
    matches = [
        result for result in results.values()
        if result.get('test_case_id') == test_case_id
    ]
    matches.sort(key=lambda item: item.get('completed_at') or '', reverse=True)
    return {'test_case_id': test_case_id, 'results': matches}


@app.post('/api/testcases/seed')
def seed_test_case() -> dict:
    return {'seeded': True}
