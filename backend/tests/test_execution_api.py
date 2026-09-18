from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get('/api/health')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'


def test_create_execution_and_queue_response():
    response = client.post('/api/executions', json={'test_case_id': 'TC_LOGIN_001'})
    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'QUEUED'
    assert data['execution_id'].startswith('exec_')

    fetch = client.get(f"/api/executions/{data['execution_id']}")
    assert fetch.status_code == 200
    execution = fetch.json()
    assert execution['test_case_id'] == 'TC_LOGIN_001'
    assert execution['status'] == 'QUEUED'


def test_invalid_test_case_is_rejected():
    response = client.post('/api/executions', json={'test_case_id': 'UNKNOWN_CASE'})
    assert response.status_code == 404


def test_invalid_auth_profile_is_rejected():
    response = client.post(
        '/api/executions',
        json={'test_case_id': 'TC_LOGIN_001', 'auth_profile_id': 'INVALID_PROFILE'},
    )
    assert response.status_code == 400
    assert response.json()['detail'] == 'Invalid auth profile'


def test_malformed_auth_profile_id_is_rejected():
    response = client.post(
        '/api/executions',
        json={'test_case_id': 'TC_LOGIN_001', 'auth_profile_id': '../secrets'},
    )
    assert response.status_code == 400
    assert response.json()['detail'] == 'Invalid auth profile'


def test_valid_auth_profile_is_accepted():
    response = client.post(
        '/api/executions',
        json={'test_case_id': 'TC_LOGIN_001', 'auth_profile_id': 'AUTH_STUDENT_001'},
    )
    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'QUEUED'

    execution = client.get(f"/api/executions/{data['execution_id']}").json()
    assert execution['auth_profile_id'] == 'AUTH_STUDENT_001'


def test_worker_status_endpoint():
    response = client.get('/api/worker/status')
    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'running'
    assert body['worker_type'] == 'node'
    assert body['queue'] == 'execution'


def test_execution_queue_endpoint_returns_queued_jobs():
    create = client.post('/api/executions', json={'test_case_id': 'TC_LOGIN_001'})
    assert create.status_code == 200
    execution_id = create.json()['execution_id']

    queue_response = client.get('/api/executions/queue')
    assert queue_response.status_code == 200
    body = queue_response.json()
    assert 'queue' in body
    assert isinstance(body['queue'], list)
    assert any(job.get('execution_id') == execution_id for job in body['queue'])


def test_execution_queue_endpoint_empty_shape():
    response = client.get('/api/executions/queue')
    assert response.status_code == 200
    body = response.json()
    assert body == {'queue': body['queue']}
    assert isinstance(body['queue'], list)


def test_result_endpoint_returns_404_when_missing():
    response = client.get('/api/results/exec_missing_result')
    assert response.status_code == 404


def test_test_case_results_endpoint_shape():
    response = client.get('/api/test-cases/TC_LOGIN_001/results')
    assert response.status_code == 200
    body = response.json()
    assert body['test_case_id'] == 'TC_LOGIN_001'
    assert isinstance(body['results'], list)
    for result in body['results']:
        assert 'execution_id' in result
        assert 'status' in result
        assert 'storage-state' not in str(result).lower()
