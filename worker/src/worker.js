const fs = require('node:fs');
const path = require('node:path');
const { QueueStore } = require('./queue-store');
const { runInDocker } = require('./docker-runner');
const { buildExecutionResult } = require('./execution-result');

const projectRoot = path.resolve(__dirname, '..', '..');
const executionStorePath = path.join(projectRoot, 'backend', 'data', 'executions.json');
const queuePath = path.join(projectRoot, 'backend', 'data', 'execution_queue.json');
const resultPath = path.join(projectRoot, 'backend', 'data', 'results.json');

const queueStore = new QueueStore({ executionStorePath, queuePath, resultPath });

function log(message) {
  console.log(message);
}

async function processJob(job) {
  if (!job || !job.execution_id) return;

  const executionId = job.execution_id;
  const startedAt = new Date().toISOString();
  log(`[WORKER] Job picked: ${executionId}`);

  log(`[DOCKER] Starting container: testflow-exec-${executionId}`);
  let result;
  try {
    result = await runInDocker({
      executionId,
      testCaseId: job.test_case_id,
      authProfileId: job.auth_profile_id,
    });
  } catch (error) {
    result = buildExecutionResult({
      projectRoot,
      executionId,
      startedAt,
      completedAt: new Date().toISOString(),
      exitCode: 1,
      stderr: error.message || 'Worker execution failed',
      errorMessage: error.message || 'Worker execution failed',
    });
  }

  log(`[PLAYWRIGHT] Exit code: ${result.exit_code}`);
  log(`[WORKER] Result: ${result.status}`);
  const persisted = queueStore.markResult(executionId, {
    execution_id: executionId,
    test_case_id: job.test_case_id,
    auth_profile_id: job.auth_profile_id || null,
    status: result.status,
    exit_code: result.exit_code,
    duration: Number((result.duration || 0).toFixed(2)),
    started_at: result.started_at || startedAt,
    completed_at: result.completed_at || new Date().toISOString(),
    error_message: result.error_message || null,
    artifacts: result.artifacts || [],
  });
  fs.appendFileSync(path.join(projectRoot, 'backend', 'data', 'worker.log'), `${new Date().toISOString()} ${JSON.stringify({ executionId, status: persisted.status })}\n`, 'utf8');
}

async function main() {
  log('[WORKER] Node worker started');
  while (true) {
    const nextJob = await queueStore.claimNext();
    if (!nextJob) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    await processJob(nextJob);
  }
}

main().catch((err) => {
  log(`[WORKER] worker failure: ${err.message}`);
  process.exit(1);
});
