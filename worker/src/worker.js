const API_BASE_URL = (process.env.API_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 1000);
const WORKER_TOKEN = process.env.INTERNAL_WORKER_TOKEN || "";

function headers() {
  const h = { "Content-Type": "application/json" };
  if (WORKER_TOKEN) {
    h["X-Worker-Token"] = WORKER_TOKEN;
  }
  return h;
}

async function postJson(pathname, body) {
  const response = await fetch(`${API_BASE_URL}${pathname}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body ?? {}),
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!response.ok) {
    const message = data?.message || data?.detail || `HTTP ${response.status}`;
    throw new Error(`${pathname} failed: ${message}`);
  }
  return data;
}

async function pollJob() {
  const data = await postJson("/api/internal/worker/poll");
  return data?.job || null;
}

async function submitResult(payload) {
  return postJson("/api/internal/worker/result", payload);
}

function statusFromExitCode(exitCode) {
  if (exitCode === 0) {
    return "PASSED";
  }
  if (exitCode === 124) {
    return "TIMEOUT";
  }
  return "FAILED";
}

async function runJob(job) {
  const { executeTest } = await import("./docker-runner.js");
  const startedAt = new Date().toISOString();

  if (!job.test_file) {
    const completedAt = new Date().toISOString();
    await submitResult({
      execution_id: job.id,
      status: "FAILED",
      exit_code: 2,
      duration: 0,
      error_message: `Test script not found for test case '${job.test_case_id}'`,
      stdout: "",
      stderr: "",
      log_file_path: null,
      artifacts: [],
      started_at: startedAt,
      completed_at: completedAt,
      runner_type: "none",
    });
    return;
  }

  if (job.auth_storage_state_error) {
    const completedAt = new Date().toISOString();
    await submitResult({
      execution_id: job.id,
      status: "FAILED",
      exit_code: 2,
      duration: 0,
      error_message: job.auth_storage_state_error,
      stdout: "",
      stderr: "",
      log_file_path: null,
      artifacts: [],
      started_at: startedAt,
      completed_at: completedAt,
      runner_type: "none",
    });
    return;
  }

  const telemetry = await executeTest({
    testFile: job.test_file,
    executionId: job.id,
    artifactsDir: job.artifacts_dir,
    authStorageStatePath: job.auth_storage_state_path,
    timeoutSeconds: job.timeout_seconds || 60,
    executionMode: job.execution_mode || "auto",
  });

  await submitResult({
    execution_id: job.id,
    status: statusFromExitCode(telemetry.exit_code),
    exit_code: telemetry.exit_code,
    duration: telemetry.duration,
    error_message: telemetry.error_message,
    stdout: telemetry.stdout,
    stderr: telemetry.stderr,
    log_file_path: telemetry.log_file,
    artifacts: telemetry.artifacts,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    runner_type: telemetry.runner_type,
  });
}

async function loop() {
  console.log(`[testflow-worker] polling ${API_BASE_URL} every ${POLL_INTERVAL_MS}ms`);
  while (true) {
    try {
      const job = await pollJob();
      if (job) {
        console.log(`[testflow-worker] claimed ${job.id} (${job.test_case_id})`);
        await runJob(job);
        console.log(`[testflow-worker] finished ${job.id}`);
      }
    } catch (err) {
      console.error(`[testflow-worker] ${err.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

loop();
