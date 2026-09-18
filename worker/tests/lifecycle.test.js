const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { QueueStore } = require('../src/queue-store.js');
const { buildExecutionResult } = require('../src/execution-result.js');

function createTempStore() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'testflow-lifecycle-'));
  return {
    tempRoot,
    store: new QueueStore({
      executionStorePath: path.join(tempRoot, 'executions.json'),
      queuePath: path.join(tempRoot, 'execution_queue.json'),
      resultPath: path.join(tempRoot, 'results.json'),
    }),
  };
}

function seedExecution(store, executionId) {
  fs.writeFileSync(
    store.executionStorePath,
    JSON.stringify({
      [executionId]: {
        execution_id: executionId,
        test_case_id: 'TC_LOGIN_001',
        auth_profile_id: 'AUTH_STUDENT_001',
        status: 'QUEUED',
      },
    }, null, 2),
  );
}

test('lifecycle transitions QUEUED to RUNNING to PASSED with stored result', async () => {
  const { tempRoot, store } = createTempStore();
  const executionId = 'exec_lifecycle_001';
  seedExecution(store, executionId);
  store.enqueue({
    execution_id: executionId,
    test_case_id: 'TC_LOGIN_001',
    auth_profile_id: 'AUTH_STUDENT_001',
  });

  assert.equal(store.listQueued().length, 1);
  const job = await store.claimNext();
  assert.equal(job.execution_id, executionId);
  assert.equal(store.listQueued().length, 0);

  const executions = JSON.parse(fs.readFileSync(store.executionStorePath, 'utf8'));
  assert.equal(executions[executionId].status, 'RUNNING');

  const startedAt = new Date().toISOString();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const completedAt = new Date().toISOString();
  const dockerResult = buildExecutionResult({
    projectRoot: tempRoot,
    executionId,
    startedAt,
    completedAt,
    exitCode: 0,
    stdout: 'ok',
    stderr: '',
  });

  const persisted = store.markResult(executionId, {
    execution_id: executionId,
    test_case_id: job.test_case_id,
    auth_profile_id: job.auth_profile_id,
    status: dockerResult.status,
    exit_code: dockerResult.exit_code,
    duration: dockerResult.duration,
    started_at: dockerResult.started_at,
    completed_at: dockerResult.completed_at,
    error_message: dockerResult.error_message,
    artifacts: dockerResult.artifacts,
  });

  assert.equal(persisted.status, 'PASSED');
  assert.ok(persisted.duration > 0);
  assert.ok(persisted.artifacts.length > 0);

  const finalExecutions = JSON.parse(fs.readFileSync(store.executionStorePath, 'utf8'));
  assert.equal(finalExecutions[executionId].status, 'PASSED');

  const results = JSON.parse(fs.readFileSync(store.resultPath, 'utf8'));
  assert.equal(results[executionId].auth_profile_id, 'AUTH_STUDENT_001');
  assert.equal(results[executionId].status, 'PASSED');

  fs.rmSync(tempRoot, { recursive: true, force: true });
});
