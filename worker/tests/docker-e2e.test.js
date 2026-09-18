const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { runInDocker, dockerAvailable } = require('../src/docker-runner.js');

test('docker e2e produces PASSED result with duration and artifacts', async (t) => {
  const hasDocker = await dockerAvailable();
  if (!hasDocker) {
    t.skip('Docker is not available');
    return;
  }

  const projectRoot = path.resolve(__dirname, '..', '..');
  const executionId = `exec_e2e_${Date.now()}`;
  const result = await runInDocker({
    executionId,
    testCaseId: 'TC_LOGIN_001',
    authProfileId: null,
  });

  assert.equal(result.status, 'PASSED');
  assert.equal(result.exit_code, 0);
  assert.ok(result.duration > 0);
  assert.ok(result.started_at);
  assert.ok(result.completed_at);
  assert.ok(result.artifacts.length > 0);

  for (const artifact of result.artifacts) {
    assert.ok(fs.existsSync(path.join(projectRoot, ...artifact.split('/'))));
  }

  const dockerLog = fs.readFileSync(
    path.join(projectRoot, 'artifacts', 'executions', executionId, 'logs', 'docker.log'),
    'utf8',
  );
  assert.match(dockerLog, /exit_code=0/);
  assert.doesNotMatch(dockerLog, /"cookies"/);
});
