import { clearAccount, ensureFreshAccount, readAccount, type RefreshResult } from "./account";
import { friendlyErrorMessage } from "./friendlyErrors";

// supabase-js is ~62 KB gzipped. It is only needed as a fallback when no
// TestFlow account is stored, so load it lazily instead of shipping it on
// every route through this module.
const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function supabaseAccessToken(): Promise<string | null> {
  if (!supabaseConfigured) return null;
  const { supabase } = await import("./supabase");
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Error thrown for non-2xx API responses; carries the HTTP status. */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function resolveApiUrl(): string {
  if (typeof window !== "undefined") return "/api";
  const internalApiUrl = process.env["INTERNAL_API_URL"]?.trim();
  const publicApiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api").replace(/\/$/, "");
  return (internalApiUrl || publicApiUrl).replace(/\/$/, "");
}

const GET_CACHE_MS = 20000;
const GET_STALE_MS = 180000;
const getCache = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

// Cached data belongs to the signed-in account; drop it when that changes.
if (typeof window !== "undefined") {
  window.addEventListener("testflow-account", () => {
    getCache.clear();
    inflight.clear();
  });
}

type RequestOptions = {
  /**
   * Live status endpoints that views poll. They still share in-flight requests
   * but never read or write the GET cache, so a poll always sees fresh status.
   */
  live?: boolean;
};

function cacheKey(path: string, init: RequestInit) {
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET") return "";
  // Live execution status must not be served from the GET cache.
  if (path.startsWith("/executions") || (path.startsWith("/test-runs") && !path.startsWith("/test-runs/latest"))) return "";
  const account = readAccount();
  const accountId = account?.userId || account?.email || "anonymous";
  return `${accountId}|${path}`;
}

function startRequest<T>(path: string, init: RequestInit, key: string, cacheable: boolean): Promise<T> {
  const promise = performRequest<T>(path, init).then((data) => {
    if (cacheable) getCache.set(key, { at: Date.now(), data });
    else if (!key) getCache.clear();
    return data;
  });
  if (key) {
    inflight.set(key, promise);
    // `.finally()` returns a new promise that rejects with the request; swallow it here
    // (callers handle the original) so failed requests aren't unhandled rejections.
    promise
      .finally(() => {
        if (inflight.get(key) === promise) inflight.delete(key);
      })
      .catch(() => {});
  }
  return promise;
}

/** Shared request helper for feature modules (same auth, base URL, caching and error handling as `api`). */
export function apiRequest<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
  return request<T>(path, init, options);
}

/** Authorization headers for a fresh session (for raw fetches such as file downloads). */
export async function authHeaders(): Promise<Headers> {
  const account = await ensureFreshAccount(refreshSession);
  const headers = new Headers();
  if (account?.accessToken) headers.set("Authorization", `Bearer ${account.accessToken}`);
  return headers;
}

/** GETs are served stale-while-revalidate: fresh for GET_CACHE_MS, then returned while a refetch runs, up to GET_STALE_MS. */
async function request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
  const key = cacheKey(path, init);
  const cacheable = Boolean(key) && !options.live;
  if (key) {
    const pending = inflight.get(key);
    if (!cacheable) {
      if (pending) return pending as Promise<T>;
      return startRequest<T>(path, init, key, false);
    }
    const hit = getCache.get(key);
    const age = hit ? Date.now() - hit.at : Number.POSITIVE_INFINITY;
    if (pending && age >= GET_STALE_MS) return pending as Promise<T>;
    if (hit && age < GET_STALE_MS) {
      // Background revalidation; errors are ignored (the stale value was already served).
      if (age >= GET_CACHE_MS && !pending) startRequest<T>(path, init, key, true).catch(() => {});
      return hit.data as T;
    }
    if (pending) return pending as Promise<T>;
  }
  return startRequest<T>(path, init, key, cacheable);
}

const PUBLIC_AUTH_PATHS = new Set([
  "/auth/login",
  "/auth/signup",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
]);

function refreshSession(refreshToken: string): Promise<RefreshResult> {
  return performRequest<RefreshResult>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

let redirectingToLogin = false;

/** Session rejected by the API: clear it and go to /login?next=<current path>, once. */
function redirectToLogin() {
  if (redirectingToLogin) return;
  const { pathname, search } = window.location;
  if (pathname === "/login" || pathname.startsWith("/login/")) return;
  redirectingToLogin = true;
  clearAccount();
  window.location.assign(`/login?next=${encodeURIComponent(pathname + search)}`);
}

/**
 * Ensures the stored session is fresh (single shared refresh). Resolves to
 * `false` when there is no usable session and the user must sign in again.
 */
export async function ensureSession(): Promise<boolean> {
  return Boolean(await ensureFreshAccount(refreshSession));
}

async function performRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  // Wait for a shared token refresh before any authenticated call, so callers
  // never send an expiring token. Auth endpoints themselves skip this.
  const account = PUBLIC_AUTH_PATHS.has(path) ? readAccount() : await ensureFreshAccount(refreshSession);
  if (account?.accessToken) {
    headers.set("Authorization", `Bearer ${account.accessToken}`);
  } else {
    const token = await supabaseAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    const apiUrl = resolveApiUrl();
    response = await fetch(`${apiUrl}${path}`, { ...init, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network request failed";
    throw new Error(
      message === "Failed to fetch"
        ? friendlyErrorMessage(`Could not reach the API at ${resolveApiUrl()}. Is FastAPI running (e.g. uvicorn on port 8000)?`)
        : message,
      { cause: err }
    );
  }
  if (response.status === 401 && !PUBLIC_AUTH_PATHS.has(path) && typeof window !== "undefined") {
    redirectToLogin();
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = Array.isArray(payload.message)
      ? payload.message.join(", ")
      : payload.detail ?? payload.message ?? "Request failed";
    throw new ApiError(friendlyErrorMessage(String(message)), response.status);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

export type AccountResponse = {
  accessToken?: string | null;
  refreshToken?: string | null;
  userId?: string | null;
  email: string;
  name: string;
  confirmationRequired?: boolean;
};

export const accountApi = {
  login: (email: string, password: string) =>
    request<AccountResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  signup: (name: string, email: string, password: string) =>
    request<AccountResponse>("/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  refresh: (refreshToken: string) =>
    request<AccountResponse>("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }) }),
  me: () => request<AccountResponse>("/auth/me"),
  updateProfile: (name: string) =>
    request<AccountResponse>("/auth/profile", { method: "PATCH", body: JSON.stringify({ name }) }),
  updatePassword: (password: string) =>
    request<AccountResponse>("/auth/password", { method: "POST", body: JSON.stringify({ password }) }),
  forgotPassword: (email: string) =>
    request<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (accessToken: string, password: string) =>
    request<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ accessToken, password }),
    }),
};

export type ProjectInput = {
  name: string;
  baseUrl: string;
  description?: string;
  /** Create only: name of the first environment (on the base URL). Blank means "Default". */
  environmentName?: string;
};

export type ExecutionState = "queued" | "running" | "completed" | "failed" | "scheduled" | "cancelled";

export type ScheduledExecution = {
  jobId: string;
  scheduledFor?: string | null;
  projectId?: string | null;
  testCaseId?: string | null;
  testCaseCode?: string | null;
  timeZone?: string | null;
};

/** A suite or project run waiting to start. Its test cases are resolved when it fires. */
export type ScheduledBatch = {
  id: string;
  batchType: "suite" | "project";
  projectId: string;
  suiteId?: string | null;
  suiteCategory?: string | null;
  environmentId: string;
  environmentName?: string | null;
  projectName?: string | null;
  suiteName?: string | null;
  scheduledFor: string;
  timeZone?: string | null;
  runBy?: string | null;
  createdAt: string;
};

export type ScheduleBatchInput = {
  environmentId: string;
  /** ISO instant with offset. */
  runAt: string;
  /** IANA timezone the tester picked. */
  timeZone: string;
};

export type ReportRun = {
  id: string;
  projectId?: string | null;
  projectName?: string | null;
  suiteId?: string | null;
  suiteName?: string | null;
  testCaseId?: string | null;
  testCaseCode?: string | null;
  testName?: string | null;
  category?: string | null;
  status: string;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  runBy?: string | null;
  screenshotPath?: string | null;
};

export type RunScreenshot = {
  file: string;
  label: string;
  failed?: boolean;
  error?: string | null;
  /** Signed URL relative to the API base (new backend). Expires after ~15 minutes. */
  url?: string | null;
};

/** Absolute URL for an API-relative asset path (same base as requests). */
export function apiAssetUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${resolveApiUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Legacy unsigned step-screenshot URL (current backend). */
export function testRunStepUrl(runId: string, file: string): string {
  return `${resolveApiUrl()}/test-runs/${encodeURIComponent(runId)}/screenshots/${encodeURIComponent(file)}`;
}

/** Image URL for a step screenshot: the signed `url` when present, else the legacy URL. */
export function stepScreenshotSrc(runId: string, step: Pick<RunScreenshot, "file" | "url">): string {
  if (step.url) return apiAssetUrl(step.url);
  return step.file ? testRunStepUrl(runId, step.file) : "";
}

/** Final screenshot URL: signed via `/screenshot-url` (new backend), legacy URL on 404. */
export async function finalScreenshotUrl(runId: string): Promise<string> {
  const legacy = `${resolveApiUrl()}/test-runs/${encodeURIComponent(runId)}/screenshot`;
  try {
    const { url } = await request<{ url: string }>(`/test-runs/${encodeURIComponent(runId)}/screenshot-url`, {}, { live: true });
    return url ? apiAssetUrl(url) : legacy;
  } catch {
    return legacy;
  }
}

export type TestRunHistoryItem = {
  id: string;
  testCaseId?: string | null;
  testCaseCode?: string | null;
  testName?: string | null;
  status: string;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  jobId?: string | null;
  scheduledFor?: string | null;
  timeZone?: string | null;
  screenshotPath?: string | null;
};

export type ExecutionResultPayload = {
  success: boolean;
  status: string;
  pytestReturnCode: number;
  configPath: string;
  title?: string | null;
  testFileLocation?: string | null;
  testCaseLocation?: string | null;
  validationErrors?: string[] | null;
  errorMessage?: string | null;
  durationMs?: number | null;
};

export type ExecutionStatus = {
  jobId: string;
  state: ExecutionState;
  configPath?: string | null;
  projectId?: string | null;
  testCaseCode?: string | null;
  result?: ExecutionResultPayload | null;
  error?: string | null;
  scheduledFor?: string | null;
  timeZone?: string | null;
  testRunId?: string | null;
};

export type BatchCaseOutcome = "skipped" | "queued" | "running" | "passed" | "failed" | "cancelled";

export type BatchCaseResult = {
  testCaseId: string;
  testCaseCode: string;
  name: string;
  outcome: BatchCaseOutcome;
  reason?: string | null;
  durationMs?: number | null;
  testRunId?: string | null;
  suiteId?: string | null;
  suiteName?: string | null;
};

export type BatchExecutionStatus = {
  batchId: string;
  batchType: "suite" | "project";
  projectId: string;
  suiteId?: string | null;
  total: number;
  passed: number;
  failed: number;
  queued: number;
  running: number;
  completed: number;
  skipped: number;
  cancelled?: number;
  cancelRequested?: boolean;
  finished: boolean;
  createdAt?: string | null;
  projectName?: string | null;
  suiteName?: string | null;
  suiteCategory?: string | null;
  environmentId?: string | null;
  environmentName?: string | null;
  runBy?: string | null;
  durationMs?: number | null;
  cases: BatchCaseResult[];
};

export type GroupedRun = {
  id: string;
  runType: "individual" | "suite" | "project";
  title: string;
  code?: string | null;
  suiteCategory?: string | null;
  environmentName?: string | null;
  status: string;
  startedAt?: string | null;
  durationMs?: number | null;
  projectId?: string | null;
  total?: number | null;
  completed?: number | null;
  passed?: number | null;
  failed?: number | null;
  skipped?: number | null;
  queued?: number | null;
  running?: number | null;
  cancelled?: number | null;
  errorMessage?: string | null;
};

export type StartExecutionInput = {
  configPath?: string;
  scriptPath?: string;
  projectId?: string;
  testCaseCode?: string;
  testCaseId?: string;
  headed?: boolean | null;
  runAt?: string;
  timeZone?: string;
  /** One-off environment for this run; the test case's saved environment is unchanged. */
  environmentId?: string;
};

/* ----------------------------------------------------------- global search */

export type SearchResultType = "project" | "suite" | "test_case" | "run";

export type SearchItem = {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  status?: string | null;
  updatedAt?: string | null;
  testCaseId?: string | null;
};

export type SearchGroup = {
  type: SearchResultType;
  label: string;
  total: number;
  items: SearchItem[];
};

export type SearchResponse = {
  query: string;
  type: SearchResultType | "all";
  groups: SearchGroup[];
};

export type SearchOptions = {
  type?: SearchResultType | "all";
  projectId?: string | null;
  limit?: number;
};

/* ----------------------------------------------------------------- workers */

export type WorkerSlot = {
  index: number;
  state: "idle" | "running";
  jobId?: string | null;
  runId?: string | null;
  testCaseId?: string | null;
  projectId?: string | null;
  /** The test case CODE (e.g. "TC-007"). */
  testName?: string | null;
  startedAt?: string | null;
  /** Client-side enrichment: resolved test case name (see useWorkers). */
  testCaseName?: string | null;
};

export type WorkerWarmState = {
  browserReady: boolean;
  spareContexts: number;
  browserLaunchedAt?: string | null;
  testsSinceLaunch?: number | null;
  lastRecycleAt?: string | null;
  coldStartsAvoided?: number | null;
};

/**
 * One worker. Stale workers whose heartbeat key expired only carry
 * id/status/heartbeatAgeSec/lastHeartbeatAt; browser/process/warm are null and counts 0.
 */
export type WorkerInfo = {
  id: string;
  hostname?: string | null;
  pid?: number | null;
  version?: string | null;
  startedAt?: string | null;
  lastHeartbeatAt: string;
  heartbeatAgeSec: number;
  status: "online" | "draining" | "stale";
  concurrency: number;
  busy: number;
  idle: number;
  slots: WorkerSlot[];
  browser: { connected: boolean; version: string | null; contexts: number } | null;
  process: { rssMb: number; heapUsedMb: number; uptimeSec: number; loadAvg1: number; cpuCount: number } | null;
  processedTotal: number;
  failedTotal: number;
  /** Optional: older worker builds don't send it. */
  warm?: WorkerWarmState | null;
};

export type WorkersResponse = {
  generatedAt: string;
  /** slots/busy/idle count online + draining workers only. */
  totals: { workers: number; online: number; draining?: number; stale: number; slots: number; busy: number; idle: number };
  queue: { queued: number; scheduled: number; processing: number; batchesPending: number | null } | null;
  message?: string;
  workers: WorkerInfo[];
};

/* ----------------------------------------------------------- notifications */

export type NotificationType = "run_failed" | "run_passed" | "batch_completed" | "run_stuck" | "auth_profile_attention" | "system";
export type NotificationSeverity = "info" | "success" | "warning" | "error";

export type AppNotification = {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body?: string | null;
  /** App-relative link, e.g. "/projects/…/results/…". */
  link?: string | null;
  projectId?: string | null;
  /** Not in the contract yet; shown as a chip when present. */
  projectName?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  read: boolean;
  createdAt: string;
};

export type NotificationsPage = { items: AppNotification[]; unreadCount: number; nextCursor: string | null };

export type NotificationPreferences = { runFailed: boolean; runPassed: boolean; batchCompleted: boolean; runStuck: boolean };

/** True for "endpoint not deployed" errors (old backend): callers treat these as empty. */
export function isNotFoundError(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 404;
  return error instanceof Error && /not found/i.test(error.message);
}

/** True when the server reports the feature as temporarily unavailable (e.g. 503: table not migrated). */
export function isUnavailableError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 503;
}

export const api = {
  /** Worker heartbeats and execution slots. Live (never cached). */
  workers: () => request<WorkersResponse>("/workers", {}, { live: true }),
  /** In-app notifications. A 404 (old backend) should be treated as empty by callers. */
  notifications: (options: { unreadOnly?: boolean; limit?: number; before?: string | null } = {}) => {
    const params = new URLSearchParams({ limit: String(options.limit ?? 20) });
    if (options.unreadOnly) params.set("unreadOnly", "true");
    if (options.before) params.set("before", options.before);
    return request<NotificationsPage>(`/notifications?${params.toString()}`, {}, { live: true });
  },
  notificationsUnreadCount: () => request<{ unreadCount: number }>("/notifications/unread-count", {}, { live: true }),
  markNotificationRead: (id: string) =>
    request<{ unreadCount: number }>(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }),
  markNotificationUnread: (id: string) =>
    request<{ unreadCount: number }>(`/notifications/${encodeURIComponent(id)}/unread`, { method: "POST" }),
  markAllNotificationsRead: () => request<{ updated: number; unreadCount: number }>("/notifications/read-all", { method: "POST" }),
  deleteNotification: (id: string) => request<void>(`/notifications/${encodeURIComponent(id)}`, { method: "DELETE" }),
  notificationPreferences: () => request<NotificationPreferences>("/notifications/preferences", {}, { live: true }),
  /** Accepts a partial body; returns the full object. 503 when the table isn't migrated. */
  updateNotificationPreferences: (input: Partial<NotificationPreferences>) =>
    request<NotificationPreferences>("/notifications/preferences", { method: "PUT", body: JSON.stringify(input) }),
  /** Global search across projects, suites, test cases and runs. Live (never cached). */
  search: (query: string, options: SearchOptions = {}, signal?: AbortSignal) => {
    const params = new URLSearchParams({ q: query });
    if (options.type && options.type !== "all") params.set("type", options.type);
    if (options.projectId) params.set("projectId", options.projectId);
    if (options.limit) params.set("limit", String(options.limit));
    return request<SearchResponse>(`/search?${params.toString()}`, { signal }, { live: true });
  },
  dashboard: () => request<DashboardData>("/dashboard"),
  projects: () => request<ProjectSummary[]>("/projects"),
  project: (id: string) => request<ProjectDetail>(`/projects/${id}`),
  resolveStartUrl: (projectId: string, startPath: string, environmentId?: string | null) => {
    const params = new URLSearchParams({ startPath });
    if (environmentId) params.set("environmentId", environmentId);
    return request<{ resolvedStartUrl: string }>(
      `/projects/${projectId}/resolve-start-url?${params.toString()}`
    );
  },
  environments: (projectId: string) =>
    request<EnvironmentSummary[]>(`/projects/${projectId}/environments`),
  createEnvironment: (projectId: string, input: EnvironmentInput) =>
    request<EnvironmentSummary>(`/projects/${projectId}/environments`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateEnvironment: (projectId: string, environmentId: string, input: Partial<EnvironmentInput>) =>
    request<EnvironmentSummary>(`/projects/${projectId}/environments/${environmentId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  /** Returns the project's environments with the new default flagged. 409 until the migration is applied. */
  setDefaultEnvironment: (projectId: string, environmentId: string) =>
    request<EnvironmentSummary[]>(`/projects/${projectId}/environments/${environmentId}/default`, { method: "POST" }),
  deleteEnvironment: (projectId: string, environmentId: string) =>
    request<void>(`/projects/${projectId}/environments/${environmentId}`, { method: "DELETE" }),
  authProfiles: (projectId: string) =>
    request<AuthProfileSummary[]>(`/projects/${projectId}/auth-profiles`),
  createAuthProfile: (projectId: string, input: AuthProfileInput) =>
    request<AuthProfileSummary>(`/projects/${projectId}/auth-profiles`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  recordAuthProfileLogin: (projectId: string, profileId: string) =>
    request<AuthProfileSummary>(`/projects/${projectId}/auth-profiles/${profileId}/record`, {
      method: "POST",
      signal: AbortSignal.timeout(60 * 60 * 1000),
    }),
  setAuthProfileCredentials: (
    projectId: string,
    profileId: string,
    input: AuthProfileCredentialsInput
  ) =>
    request<AuthProfileSummary>(
      `/projects/${projectId}/auth-profiles/${profileId}/credentials`,
      { method: "PUT", body: JSON.stringify(input) }
    ),
  setAuthProfileRefresh: (
    projectId: string,
    profileId: string,
    refresh: AuthRefreshConfig | null
  ) =>
    request<AuthProfileSummary>(
      `/projects/${projectId}/auth-profiles/${profileId}/refresh`,
      { method: "PUT", body: JSON.stringify({ refresh }) }
    ),
  deleteAuthProfile: (projectId: string, profileId: string) =>
    request<void>(`/projects/${projectId}/auth-profiles/${profileId}`, { method: "DELETE" }),
  createProject: (input: ProjectInput) =>
    request<ProjectDetail>("/projects", { method: "POST", body: JSON.stringify(input) }),
  updateProject: (id: string, input: Partial<ProjectInput>) =>
    request<ProjectDetail>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: "DELETE" }),
  testCases: (projectId: string) =>
    request<TestCaseSummary[]>(`/projects/${projectId}/test-cases`),
  testCase: (projectId: string, testCaseId: string) =>
    request<TestCaseSummary>(`/projects/${projectId}/test-cases/${testCaseId}`),
  createTestCase: (projectId: string, input: TestCaseInput) =>
    request<TestCaseSummary>(`/projects/${projectId}/test-cases`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  recordTestCase: (projectId: string, testCaseId: string) =>
    request<TestCaseSummary>(`/projects/${projectId}/test-cases/${testCaseId}/record`, {
      method: "POST",
      signal: AbortSignal.timeout(60 * 60 * 1000),
    }),
  deleteTestCase: (projectId: string, testCaseId: string) =>
    request<void>(`/projects/${projectId}/test-cases/${testCaseId}`, { method: "DELETE" }),
  updateTestCase: (projectId: string, testCaseId: string, input: UpdateTestCaseInput) =>
    request<TestCaseSummary>(`/projects/${projectId}/test-cases/${testCaseId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  getTestScript: (projectId: string, testCaseId: string) =>
    request<TestScriptResponse>(`/projects/${projectId}/test-cases/${testCaseId}/script`),
  saveTestScript: (projectId: string, testCaseId: string, content: string) =>
    request<TestCaseSummary>(`/projects/${projectId}/test-cases/${testCaseId}/script`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  publishTestCase: (projectId: string, testCaseId: string) =>
    request<TestCaseSummary>(`/projects/${projectId}/test-cases/${testCaseId}/publish`, {
      method: "POST",
    }),
  testCaseVersions: (projectId: string, testCaseId: string) =>
    request<TestCaseVersionSummary[]>(`/projects/${projectId}/test-cases/${testCaseId}/versions`),
  testCaseVersion: (projectId: string, testCaseId: string, versionNumber: number) =>
    request<TestCaseVersionDetail>(
      `/projects/${projectId}/test-cases/${testCaseId}/versions/${versionNumber}`
    ),
  testSuites: (projectId: string) =>
    request<TestSuiteSummary[]>(`/projects/${projectId}/test-suites`),
  testSuite: (projectId: string, suiteId: string) =>
    request<TestSuiteDetail>(`/projects/${projectId}/test-suites/${suiteId}`),
  createTestSuite: (projectId: string, input: TestSuiteInput) =>
    request<TestSuiteSummary>(`/projects/${projectId}/test-suites`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateTestSuite: (projectId: string, suiteId: string, input: Partial<TestSuiteInput>) =>
    request<TestSuiteSummary>(`/projects/${projectId}/test-suites/${suiteId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteTestSuite: (projectId: string, suiteId: string) =>
    request<void>(`/projects/${projectId}/test-suites/${suiteId}`, { method: "DELETE" }),
  addTestCasesToSuite: (projectId: string, suiteId: string, testCaseIds: string[]) =>
    request<TestSuiteDetail>(`/projects/${projectId}/test-suites/${suiteId}/test-cases`, {
      method: "POST",
      body: JSON.stringify({ testCaseIds }),
    }),
  removeTestCaseFromSuite: (projectId: string, suiteId: string, testCaseId: string) =>
    request<TestSuiteDetail>(
      `/projects/${projectId}/test-suites/${suiteId}/test-cases/${testCaseId}`,
      { method: "DELETE" }
    ),
  startExecution: (input: StartExecutionInput) =>
    request<ExecutionStatus>("/executions", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  startSuiteRun: (projectId: string, suiteId: string, environmentId: string) =>
    request<BatchExecutionStatus>("/executions/suites", {
      method: "POST",
      body: JSON.stringify({ projectId, suiteId, environmentId }),
    }),
  startProjectRun: (projectId: string, suiteCategory: string | undefined, environmentId: string) =>
    request<BatchExecutionStatus>("/executions/projects", {
      method: "POST",
      body: JSON.stringify({ projectId, suiteCategory, environmentId }),
    }),
  scheduleSuiteRun: (projectId: string, suiteId: string, input: ScheduleBatchInput) =>
    request<ScheduledBatch>("/executions/suites/schedule", {
      method: "POST",
      body: JSON.stringify({ projectId, suiteId, ...input }),
    }),
  scheduleProjectRun: (projectId: string, suiteCategory: string | undefined, input: ScheduleBatchInput) =>
    request<ScheduledBatch>("/executions/projects/schedule", {
      method: "POST",
      body: JSON.stringify({ projectId, suiteCategory, ...input }),
    }),
  scheduledBatches: (filter: { projectId?: string; suiteId?: string } = {}) => {
    const params = new URLSearchParams();
    if (filter.projectId) params.set("projectId", filter.projectId);
    if (filter.suiteId) params.set("suiteId", filter.suiteId);
    const query = params.toString();
    return request<ScheduledBatch[]>(`/executions/scheduled-batches${query ? `?${query}` : ""}`, {}, { live: true });
  },
  cancelScheduledBatch: (scheduleId: string) =>
    request<void>(`/executions/scheduled-batches/${scheduleId}`, { method: "DELETE" }),
  getBatchRun: (batchId: string) =>
    request<BatchExecutionStatus>(`/executions/batches/${batchId}`, {}, { live: true }),
  cancelBatchRun: (batchId: string) =>
    request<BatchExecutionStatus>(`/executions/batches/${batchId}/cancel`, { method: "POST" }),
  rerunBatch: (batchId: string) =>
    request<BatchExecutionStatus>(`/executions/batches/${batchId}/rerun`, { method: "POST" }),
  cancelTestRun: (runId: string) =>
    request<void>(`/test-runs/${runId}/cancel`, { method: "POST" }),
  rerunTestRun: (runId: string) =>
    request<ExecutionStatus>(`/test-runs/${runId}/rerun`, { method: "POST" }),
  getExecution: (jobId: string) => request<ExecutionStatus>(`/executions/${jobId}`, {}, { live: true }),
  /** Upcoming single-test runs; all of them when no test case is given. */
  scheduledExecutions: (testCaseId?: string) =>
    request<ScheduledExecution[]>(
      testCaseId ? `/executions/scheduled?testCaseId=${encodeURIComponent(testCaseId)}` : "/executions/scheduled",
      {},
      { live: true }
    ),
  cancelScheduledExecution: (jobId: string) =>
    request<void>(`/executions/scheduled/${jobId}`, { method: "DELETE" }),
  groupedRuns: () => request<GroupedRun[]>("/test-runs/grouped", {}, { live: true }),
  latestCaseRuns: (projectId: string) =>
    request<Array<{ testCaseId: string; projectId?: string | null; status: string; startedAt?: string | null; completedAt?: string | null; runBy?: string | null }>>(
      `/test-runs/latest?projectId=${encodeURIComponent(projectId)}`,
    ),
  testRuns: (limit = 50, testCaseId?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (testCaseId) params.set("testCaseId", testCaseId);
    return request<TestRunHistoryItem[]>(`/test-runs?${params.toString()}`, {}, { live: true });
  },
  reportRuns: () => request<ReportRun[]>("/test-runs/report?limit=1000"),
  reportRun: (runId: string) => request<ReportRun>(`/test-runs/${runId}`, {}, { live: true }),
  runScreenshots: (runId: string) => request<RunScreenshot[]>(`/test-runs/${runId}/screenshots`),
};

export type TestSuiteInput = {
  name: string;
  description?: string;
  category?: string;
  categories?: string[];
};

export type TestSuiteSummary = {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  category?: string | null;
  categories?: string[] | null;
  caseCount: number;
  createdAt?: string | null;
};

export type TestSuiteDetail = TestSuiteSummary & {
  testCases: TestCaseSummary[];
};

export const TEST_CASE_CATEGORIES = ["Functional", "Responsive"] as const;
export const TEST_CASE_SCENARIOS = ["Happy Path", "Negative", "Edge Case"] as const;

export type TestCaseCategory = (typeof TEST_CASE_CATEGORIES)[number];
export type TestCaseScenario = (typeof TEST_CASE_SCENARIOS)[number];

export type TestCaseInput = {
  name: string;
  description?: string;
  category?: TestCaseCategory;
  categories?: string[];
  environmentIds?: string[];
  scenario?: TestCaseScenario;
  suiteId?: string;
};

export type AssertionType = "url_contains" | "text_visible" | "page_title_contains";

export type AssertionConfig = {
  id: string;
  type: AssertionType;
  value: string;
};

export type EnvironmentInput = {
  name: string;
  baseUrl: string;
};

export type EnvironmentSummary = {
  id: string;
  projectId: string;
  name: string;
  baseUrl: string;
  /** The project's default. All false until the default-environment migration runs; then use the oldest. */
  isDefault?: boolean;
};

export type AuthProfileInput = {
  name: string;
  loginUrl?: string;
  username?: string;
  password?: string;
};

export type AuthSessionStatus = "none" | "active" | "expiring" | "expired";

export type AuthRefreshConfig = {
  strategy: "cookie" | "localStorage";
  url: string;
  method?: "GET" | "POST";
  origin?: string | null;
  accessTokenKey?: string | null;
  refreshTokenKey?: string | null;
  sendToken?: "accessToken" | "refreshToken";
  accessTokenJsonPath?: string | null;
  refreshTokenJsonPath?: string | null;
  authorizationHeader?: string | null;
};

export type AuthProfileSummary = {
  id: string;
  projectId: string;
  name: string;
  loginUrl: string;
  hasStorageState: boolean;
  sessionStatus: AuthSessionStatus;
  sessionRecordedAt: string | null;
  sessionExpiresAt: string | null;
  needsRenewal: boolean;
  hasCredentials: boolean;
  username?: string | null;
  refresh?: AuthRefreshConfig | null;
  createdAt: string;
};

export type AuthProfileCredentialsInput = {
  username: string;
  password: string;
};

export const STORAGE_KINDS = ["localStorage", "sessionStorage", "cookie"] as const;
export type StorageKind = (typeof STORAGE_KINDS)[number];

export type StorageEntry = {
  kind: StorageKind;
  key: string;
  value: string;
};

export type UpdateTestCaseInput = {
  name?: string;
  description?: string;
  environmentId?: string | null;
  environmentIds?: string[];
  authProfileId?: string | null;
  startPath?: string;
  expectedResult?: string | null;
  category?: TestCaseCategory;
  categories?: string[];
  scenario?: TestCaseScenario;
  storageSeeds?: StorageEntry[];
  storageAssertions?: StorageEntry[];
  accessibilityEnabled?: boolean;
  networkCheckEnabled?: boolean;
  /** Accepted by PATCH /test-cases/{id}. */
  assertions?: AssertionConfig[];
};

export type TestCaseSummary = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category?: TestCaseCategory;
  categories?: string[];
  scenario?: TestCaseScenario;
  automationStatus: string;
  testFile?: string | null;
  environmentId?: string | null;
  environmentIds?: string[];
  authProfileId?: string | null;
  startPath?: string;
  resolvedStartUrl?: string | null;
  suiteId?: string | null;
  expectedResult?: string | null;
  storageSeeds?: StorageEntry[];
  storageAssertions?: StorageEntry[];
  accessibilityEnabled?: boolean;
  networkCheckEnabled?: boolean;
  isDraft?: boolean;
  publishedVersion?: number;
  assertions?: AssertionConfig[];
};

export type TestScriptResponse = {
  content: string;
  testFile: string;
};

export type TestCaseVersionSummary = {
  versionNumber: number;
  label: string;
  publishedAt: string;
};

export type TestCaseVersionDetail = TestCaseVersionSummary & {
  name: string;
  description?: string | null;
  category?: TestCaseCategory;
  scenario?: TestCaseScenario;
  environmentId?: string | null;
  authProfileId?: string | null;
  startPath: string;
  expectedResult?: string | null;
  testFile?: string | null;
  scriptSnapshot?: string | null;
};

export type TestRunResult = {
  status: "Passed" | "Failed";
  duration: number;
  error: string | null;
  testRunId?: string | null;
};

export type DashboardData = {
  projects: number;
  testCases: number;
  passed: number;
  failed: number;
  recentProjects: ProjectSummary[];
};

export type ProjectSummary = {
  id: string;
  name: string;
  baseUrl: string;
  description?: string | null;
  suites: number;
  cases: number;
  passed: number;
  failed: number;
  passRate: number;
  lastRun: string | null;
  lastRunBy: string | null;
};

export type SuiteSummary = {
  id: string;
  name: string;
  category?: string | null;
  categories?: string[] | null;
  cases: number;
  passed: number;
  failed: number;
  notRun: number;
  passRate: number;
  lastRun: string | null;
  lastRunBy: string | null;
};

export type ProjectDetail = ProjectSummary & {
  description: string | null;
  suitesList: SuiteSummary[];
};
