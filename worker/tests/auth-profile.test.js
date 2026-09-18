const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  assertValidAuthProfileId,
  resolveAuthStorageState,
  authStorageStateExists,
} = require('../src/auth-profile.js');

test('resolveAuthStorageState maps profile id to host and container paths', () => {
  const projectRoot = '/project';
  const resolved = resolveAuthStorageState(projectRoot, 'AUTH_TEACHER_001');
  assert.equal(resolved.hostPath, path.join(projectRoot, 'auth', 'AUTH_TEACHER_001', 'storage-state.json'));
  assert.equal(resolved.containerPath, '/workspace/auth/AUTH_TEACHER_001/storage-state.json');
});

test('invalid auth profile ids are rejected', () => {
  assert.throws(() => assertValidAuthProfileId('../etc/passwd'), /Invalid auth profile id/);
  assert.throws(() => resolveAuthStorageState('/project', 'bad/id'), /Invalid auth profile id/);
});

test('authStorageStateExists checks file presence only', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'testflow-auth-exists-'));
  const profileId = 'AUTH_ADMIN_001';
  const authDir = path.join(tempRoot, 'auth', profileId);
  fs.mkdirSync(authDir, { recursive: true });

  assert.equal(authStorageStateExists(tempRoot, profileId), false);

  fs.writeFileSync(path.join(authDir, 'storage-state.json'), '{"cookies":[],"origins":[]}');
  assert.equal(authStorageStateExists(tempRoot, profileId), true);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});
