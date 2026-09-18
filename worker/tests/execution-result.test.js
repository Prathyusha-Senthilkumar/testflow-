const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildExecutionResult,
  collectArtifactPaths,
  durationSeconds,
} = require('../src/execution-result.js');

test('durationSeconds measures elapsed time between timestamps', () => {
  const started = '2026-01-01T00:00:00.000Z';
  const completed = '2026-01-01T00:00:02.500Z';
  assert.equal(durationSeconds(started, completed), 2.5);
});

test('buildExecutionResult writes docker.log and collects artifact paths', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'testflow-result-'));
  const executionId = 'exec_result_test';
  const startedAt = '2026-01-01T00:00:00.000Z';
  const completedAt = '2026-01-01T00:00:01.000Z';

  const result = buildExecutionResult({
    projectRoot: tempRoot,
    executionId,
    startedAt,
    completedAt,
    exitCode: 0,
    stdout: 'playwright ok',
    stderr: '',
  });

  assert.equal(result.status, 'PASSED');
  assert.equal(result.exit_code, 0);
  assert.equal(result.duration, 1);
  assert.equal(result.error_message, null);
  assert.ok(result.artifacts.includes(`artifacts/executions/${executionId}/logs/docker.log`));

  const dockerLog = fs.readFileSync(
    path.join(tempRoot, 'artifacts', 'executions', executionId, 'logs', 'docker.log'),
    'utf8',
  );
  assert.match(dockerLog, /playwright ok/);
  assert.doesNotMatch(dockerLog, /storage-state\.json/);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('collectArtifactPaths includes playwright execution log when present', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'testflow-artifacts-'));
  const executionId = 'exec_art_test';
  const logDir = path.join(tempRoot, 'artifacts', 'executions', executionId, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, 'docker.log'), 'docker');
  fs.writeFileSync(path.join(logDir, `execution-${executionId}.log`), 'execution_id=exec_art_test');

  const artifacts = collectArtifactPaths(tempRoot, executionId);
  assert.equal(artifacts.length, 2);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});
