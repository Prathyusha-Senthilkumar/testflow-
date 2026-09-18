const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolveAuthStorageState } = require('./auth-profile');

function runPlaywrightScript({ executionId, testCaseId, authProfileId, useDocker = true }) {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const artifactDir = path.join(projectRoot, 'artifacts', 'executions', executionId);
  fs.mkdirSync(path.join(artifactDir, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(artifactDir, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(artifactDir, 'traces'), { recursive: true });
  fs.mkdirSync(path.join(artifactDir, 'videos'), { recursive: true });

  const jsTestPath = path.join(projectRoot, 'tests', 'playwright-js', 'login.spec.js');
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = ['playwright', 'test', jsTestPath, '--reporter=list'];

  const env = {
    ...process.env,
    TESTFLOW_EXECUTION_ID: executionId,
    TESTFLOW_TEST_CASE_ID: testCaseId,
    TESTFLOW_AUTH_PROFILE_ID: authProfileId || '',
    TESTFLOW_ARTIFACT_DIR: artifactDir,
  };

  if (authProfileId) {
    try {
      const auth = resolveAuthStorageState(projectRoot, authProfileId);
      if (auth && fs.existsSync(auth.hostPath)) {
        env.TESTFLOW_STORAGE_STATE = auth.hostPath;
      }
    } catch {
      // Invalid profile id; Playwright runs without storage state.
    }
  }

  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: projectRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let exitCode = 0;

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      exitCode = typeof code === 'number' ? code : 1;
      const passed = exitCode === 0;
      resolve({
        executionId,
        status: passed ? 'PASSED' : 'FAILED',
        exit_code: exitCode,
        stdout,
        stderr,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        artifacts: [
          path.join('artifacts', 'executions', executionId, 'logs', 'playwright.log'),
        ],
      });
    });
  });
}

module.exports = { runPlaywrightScript };
