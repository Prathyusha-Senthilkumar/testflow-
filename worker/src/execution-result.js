const fs = require('node:fs');
const path = require('node:path');

function toArtifactPath(projectRoot, absolutePath) {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}

function durationSeconds(startedAt, completedAt) {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return 0;
  }
  return Math.max(0, Number(((end - start) / 1000).toFixed(2)));
}

function sanitizeLogText(text) {
  if (!text) {
    return '';
  }
  return String(text);
}

function writeDockerLog(projectRoot, executionId, { stdout, stderr, exitCode, startedAt, completedAt, errorMessage }) {
  const logDir = path.join(projectRoot, 'artifacts', 'executions', executionId, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, 'docker.log');
  const lines = [
    `started_at=${startedAt}`,
    `completed_at=${completedAt}`,
    `exit_code=${exitCode}`,
    errorMessage ? `error_message=${errorMessage}` : null,
    '--- stdout ---',
    sanitizeLogText(stdout),
    '--- stderr ---',
    sanitizeLogText(stderr),
  ].filter((line) => line !== null);
  fs.writeFileSync(logPath, lines.join('\n'), 'utf8');
  return logPath;
}

function collectArtifactPaths(projectRoot, executionId) {
  const logDir = path.join(projectRoot, 'artifacts', 'executions', executionId, 'logs');
  const candidates = [
    path.join(logDir, 'docker.log'),
    path.join(logDir, `execution-${executionId}.log`),
  ];
  return candidates
    .filter((candidate) => fs.existsSync(candidate))
    .map((candidate) => toArtifactPath(projectRoot, candidate));
}

function resolveExitCode(error, explicitCode) {
  if (typeof explicitCode === 'number') {
    return explicitCode;
  }
  if (error && typeof error.code === 'number') {
    return error.code;
  }
  return error ? 1 : 0;
}

function buildExecutionResult({
  projectRoot,
  executionId,
  startedAt,
  completedAt,
  exitCode,
  error,
  stdout = '',
  stderr = '',
  errorMessage = null,
}) {
  const resolvedExitCode = resolveExitCode(error, exitCode);
  const completed = completedAt || new Date().toISOString();
  const started = startedAt || completed;
  const status = resolvedExitCode === 0 ? 'PASSED' : 'FAILED';
  const message = errorMessage
    ?? (status === 'FAILED' ? (stderr || error?.message || 'Docker execution failed') : null);

  writeDockerLog(projectRoot, executionId, {
    stdout,
    stderr,
    exitCode: resolvedExitCode,
    startedAt: started,
    completedAt: completed,
    errorMessage: message,
  });

  return {
    executionId,
    status,
    exit_code: resolvedExitCode,
    duration: durationSeconds(started, completed),
    stdout,
    stderr,
    started_at: started,
    completed_at: completed,
    error_message: message,
    artifacts: collectArtifactPaths(projectRoot, executionId),
  };
}

module.exports = {
  buildExecutionResult,
  collectArtifactPaths,
  durationSeconds,
  sanitizeLogText,
  toArtifactPath,
  writeDockerLog,
};
