const fs = require('node:fs');
const path = require('node:path');

const PROFILE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function assertValidAuthProfileId(authProfileId) {
  if (!authProfileId || !PROFILE_ID_PATTERN.test(authProfileId)) {
    throw new Error('Invalid auth profile id');
  }
}

function resolveAuthStorageState(projectRoot, authProfileId) {
  if (!authProfileId) {
    return null;
  }
  assertValidAuthProfileId(authProfileId);
  const hostPath = path.join(projectRoot, 'auth', authProfileId, 'storage-state.json');
  const containerPath = `/workspace/auth/${authProfileId}/storage-state.json`;
  return { hostPath, containerPath };
}

function authStorageStateExists(projectRoot, authProfileId) {
  const resolved = resolveAuthStorageState(projectRoot, authProfileId);
  if (!resolved) {
    return false;
  }
  return fs.existsSync(resolved.hostPath);
}

module.exports = {
  assertValidAuthProfileId,
  resolveAuthStorageState,
  authStorageStateExists,
};
