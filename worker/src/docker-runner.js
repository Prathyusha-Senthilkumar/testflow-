const { exec } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { resolveAuthStorageState } = require('./auth-profile');
const { buildExecutionResult } = require('./execution-result');

function buildDockerRunCommand({ executionId, testCaseId, authProfileId, projectRoot = path.resolve(__dirname, '..', '..') }) {
  ensureContainerName(executionId);
  const artifactContainerDir = `/workspace/artifacts/executions/${executionId}`;
  const parts = [
    'docker run --rm',
    `--name testflow-exec-${executionId}`,
    `-e TESTFLOW_EXECUTION_ID=${executionId}`,
    `-e TESTFLOW_TEST_CASE_ID=${testCaseId}`,
    `-e TESTFLOW_ARTIFACT_DIR=${artifactContainerDir}`,
  ];

  if (authProfileId) {
    parts.push(`-e TESTFLOW_AUTH_PROFILE_ID=${authProfileId}`);
    const auth = resolveAuthStorageState(projectRoot, authProfileId);
    if (auth && fs.existsSync(auth.hostPath)) {
      parts.push(`-e TESTFLOW_STORAGE_STATE=${auth.containerPath}`);
      parts.push(`-v "${auth.hostPath}:${auth.containerPath}:ro"`);
    }
  }

  parts.push(
    `-v "${projectRoot}:/workspace"`,
    '-w /workspace',
    'testflow-playwright:latest',
    'bash -lc "npx playwright test tests/playwright-js/login.spec.js --reporter=list"',
  );

  return parts.join(' ');
}

function dockerAvailable() {
  return new Promise((resolve) => {
    exec('docker --version', (error) => resolve(!error));
  });
}

function ensureContainerName(executionId) {
  return `testflow-exec-${executionId}`;
}

function buildFailureResult(projectRoot, executionId, startedAt, { exitCode, errorMessage, stderr = '' }) {
  const completedAt = new Date().toISOString();
  return buildExecutionResult({
    projectRoot,
    executionId,
    startedAt,
    completedAt,
    exitCode,
    stderr,
    errorMessage,
  });
}

async function runInDocker({ executionId, testCaseId, authProfileId }) {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const startedAt = new Date().toISOString();
  const artifactDir = path.join(projectRoot, 'artifacts', 'executions', executionId);
  fs.mkdirSync(path.join(artifactDir, 'logs'), { recursive: true });

  const hasDocker = await dockerAvailable();
  if (!hasDocker) {
    return buildFailureResult(projectRoot, executionId, startedAt, {
      exitCode: 127,
      errorMessage: 'Docker unavailable',
      stderr: 'Docker is not installed or not available on PATH',
    });
  }

  if (authProfileId) {
    let auth;
    try {
      auth = resolveAuthStorageState(projectRoot, authProfileId);
    } catch {
      return buildFailureResult(projectRoot, executionId, startedAt, {
        exitCode: 1,
        errorMessage: 'Invalid auth profile',
        stderr: 'Invalid auth profile id',
      });
    }
    if (!auth || !fs.existsSync(auth.hostPath)) {
      return buildFailureResult(projectRoot, executionId, startedAt, {
        exitCode: 1,
        errorMessage: 'Auth profile storage state not found',
        stderr: 'Auth profile storage state not found',
      });
    }
  }

  const command = buildDockerRunCommand({ executionId, testCaseId, authProfileId, projectRoot });

  return new Promise((resolve) => {
    exec(command, { cwd: projectRoot, maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      const completedAt = new Date().toISOString();
      const result = buildExecutionResult({
        projectRoot,
        executionId,
        startedAt,
        completedAt,
        error,
        stdout,
        stderr,
      });
      resolve(result);
    });
  });
}

module.exports = { runInDocker, ensureContainerName, dockerAvailable, buildDockerRunCommand };
