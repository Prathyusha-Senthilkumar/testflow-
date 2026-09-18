const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { QueueStore } = require('../src/queue-store.js');

function createTempStore() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'testflow-queue-'));
  return {
    tempRoot,
    store: new QueueStore({
      executionStorePath: path.join(tempRoot, 'executions.json'),
      queuePath: path.join(tempRoot, 'execution_queue.json'),
      resultPath: path.join(tempRoot, 'results.json'),
    }),
  };
}

function seedExecution(store, executionId, status = 'QUEUED') {
  const executions = {
    [executionId]: {
      execution_id: executionId,
      test_case_id: 'TC_LOGIN_001',
      auth_profile_id: null,
      status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
  fs.writeFileSync(store.executionStorePath, JSON.stringify(executions, null, 2));
}

test('enqueue adds a job and persists it to disk', () => {
  const { tempRoot, store } = createTempStore();
  store.enqueue({
    execution_id: 'exec_test_001',
    test_case_id: 'TC_LOGIN_001',
  });

  assert.equal(store.listQueued().length, 1);
  const onDisk = JSON.parse(fs.readFileSync(store.queuePath, 'utf8'));
  assert.equal(onDisk.length, 1);
  assert.equal(onDisk[0].execution_id, 'exec_test_001');

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('jobs are processed in FIFO order', async () => {
  const { tempRoot, store } = createTempStore();
  seedExecution(store, 'exec_a');
  seedExecution(store, 'exec_b');
  seedExecution(store, 'exec_c');

  store.enqueue({ execution_id: 'exec_a', test_case_id: 'TC_LOGIN_001' });
  store.enqueue({ execution_id: 'exec_b', test_case_id: 'TC_LOGIN_001' });
  store.enqueue({ execution_id: 'exec_c', test_case_id: 'TC_LOGIN_001' });

  const first = await store.claimNext();
  const second = await store.claimNext();
  const third = await store.claimNext();

  assert.deepEqual(
    [first.execution_id, second.execution_id, third.execution_id],
    ['exec_a', 'exec_b', 'exec_c'],
  );
  assert.equal(store.listQueued().length, 0);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('claimNext returns null for an empty queue', async () => {
  const { tempRoot, store } = createTempStore();
  const job = await store.claimNext();
  assert.equal(job, null);
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('claimNext marks execution as RUNNING and removes job from queue', async () => {
  const { tempRoot, store } = createTempStore();
  seedExecution(store, 'exec_running');

  store.enqueue({ execution_id: 'exec_running', test_case_id: 'TC_LOGIN_001' });
  const job = await store.claimNext();

  assert.equal(job.execution_id, 'exec_running');
  assert.equal(store.listQueued().length, 0);

  const executions = JSON.parse(fs.readFileSync(store.executionStorePath, 'utf8'));
  assert.equal(executions.exec_running.status, 'RUNNING');

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('markResult stores FAILED and does not leave execution queued', async () => {
  const { tempRoot, store } = createTempStore();
  seedExecution(store, 'exec_fail');

  store.enqueue({ execution_id: 'exec_fail', test_case_id: 'TC_LOGIN_001' });
  const job = await store.claimNext();
  const completedAt = new Date().toISOString();

  store.markResult(job.execution_id, {
    execution_id: job.execution_id,
    test_case_id: job.test_case_id,
    auth_profile_id: null,
    status: 'FAILED',
    exit_code: 1,
    completed_at: completedAt,
    error_message: 'Docker unavailable',
    artifacts: [],
  });

  const executions = JSON.parse(fs.readFileSync(store.executionStorePath, 'utf8'));
  assert.equal(executions.exec_fail.status, 'FAILED');
  assert.equal(store.listQueued().length, 0);

  const results = JSON.parse(fs.readFileSync(store.resultPath, 'utf8'));
  assert.equal(results.exec_fail.status, 'FAILED');

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('auth_profile_id remains optional on queued jobs', () => {
  const { tempRoot, store } = createTempStore();
  store.enqueue({ execution_id: 'exec_no_auth', test_case_id: 'TC_LOGIN_001' });
  store.enqueue({
    execution_id: 'exec_with_auth',
    test_case_id: 'TC_LOGIN_001',
    auth_profile_id: 'AUTH_STUDENT_001',
  });

  const queued = store.listQueued();
  assert.equal(queued[0].auth_profile_id, null);
  assert.equal(queued[1].auth_profile_id, 'AUTH_STUDENT_001');

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('claimNext prevents duplicate claims for the same queued job', async () => {
  const { tempRoot, store } = createTempStore();
  seedExecution(store, 'exec_once');

  store.enqueue({ execution_id: 'exec_once', test_case_id: 'TC_LOGIN_001' });

  const [first, second] = await Promise.all([store.claimNext(), store.claimNext()]);
  const claimed = [first, second].filter(Boolean);

  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].execution_id, 'exec_once');
  assert.equal(store.listQueued().length, 0);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});
