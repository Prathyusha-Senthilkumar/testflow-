const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildDockerRunCommand } = require('../src/docker-runner.js');

test('docker runner uses the project Playwright image for execution', () => {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const command = buildDockerRunCommand({
    executionId: 'exec_123',
    testCaseId: 'TC_LOGIN_001',
    authProfileId: 'AUTH_STUDENT_001',
    projectRoot,
  });

  assert.match(command, /testflow-playwright:latest/);
  assert.match(command, /TESTFLOW_EXECUTION_ID=exec_123/);
  assert.match(command, /TESTFLOW_AUTH_PROFILE_ID=AUTH_STUDENT_001/);
  assert.match(command, /TESTFLOW_STORAGE_STATE=\/workspace\/auth\/AUTH_STUDENT_001\/storage-state.json/);
  assert.match(command, /storage-state.json:ro/);
  assert.match(command, /TESTFLOW_ARTIFACT_DIR=\/workspace\/artifacts\/executions\/exec_123/);
  assert.match(command, /npx playwright test tests\/playwright-js\/login.spec.js --reporter=list/);
});

test('docker runner omits auth env when no auth profile is supplied', () => {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const command = buildDockerRunCommand({
    executionId: 'exec_124',
    testCaseId: 'TC_LOGIN_001',
    authProfileId: null,
    projectRoot,
  });

  assert.doesNotMatch(command, /TESTFLOW_AUTH_PROFILE_ID=/);
  assert.doesNotMatch(command, /TESTFLOW_STORAGE_STATE=/);
  assert.doesNotMatch(command, /storage-state.json:ro/);
});

test('docker runner mounts read-only storage state for dynamic profile ids', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'testflow-auth-'));
  const profileId = 'AUTH_CUSTOMER_001';
  const authDir = path.join(tempRoot, 'auth', profileId);
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, 'storage-state.json'), '{"cookies":[],"origins":[]}');

  const command = buildDockerRunCommand({
    executionId: 'exec_125',
    testCaseId: 'TC_LOGIN_001',
    authProfileId: profileId,
    projectRoot: tempRoot,
  });

  assert.match(command, /TESTFLOW_AUTH_PROFILE_ID=AUTH_CUSTOMER_001/);
  assert.match(command, /TESTFLOW_STORAGE_STATE=\/workspace\/auth\/AUTH_CUSTOMER_001\/storage-state.json/);
  assert.match(command, /:ro"/);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});