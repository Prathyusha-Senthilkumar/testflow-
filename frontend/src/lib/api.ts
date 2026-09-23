import { isSupabaseConfigured, supabase } from "./supabase";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api").replace(/\/$/, "");

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (isSupabaseConfigured) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      headers.set("Authorization", `Bearer ${data.session.access_token}`);
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network request failed";
    throw new Error(
      message === "Failed to fetch"
        ? `Could not reach the API at ${API_URL}. Is FastAPI running (e.g. uvicorn on port 8000)?`
        : message
    );
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = Array.isArray(payload.message)
      ? payload.message.join(", ")
      : payload.detail ?? payload.message ?? "Request failed";
    throw new Error(message);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

export type ProjectInput = {
  name: string;
  baseUrl: string;
  description?: string;
};

export type ExecutionState = "queued" | "running" | "completed" | "failed" | "scheduled";

export type ScheduledExecution = {
  jobId: string;
  scheduledFor?: string | null;
  projectId?: string | null;
  testCaseId?: string | null;
  testCaseCode?: string | null;
  timeZone?: string | null;
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
  status: string;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  runBy?: string | null;
};

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
};

export type BatchCaseOutcome = "skipped" | "queued" | "running" | "passed" | "failed";

export type BatchCaseResult = {
  testCaseId: string;
  testCaseCode: string;
  name: string;
  outcome: BatchCaseOutcome;
  reason?: string | null;
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
  finished: boolean;
  cases: BatchCaseResult[];
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
};

export const api = {
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
  runTestCase: (projectId: string, testCaseId: string) =>
    request<TestRunResult>(`/projects/${projectId}/test-cases/${testCaseId}/run`, {
      method: "POST",
      signal: AbortSignal.timeout(15 * 60 * 1000),
    }),
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
  startSuiteRun: (projectId: string, suiteId: string) =>
    request<BatchExecutionStatus>("/executions/suites", {
      method: "POST",
      body: JSON.stringify({ projectId, suiteId }),
    }),
  startProjectRun: (projectId: string) =>
    request<BatchExecutionStatus>("/executions/projects", {
      method: "POST",
      body: JSON.stringify({ projectId }),
    }),
  getBatchRun: (batchId: string) =>
    request<BatchExecutionStatus>(`/executions/batches/${batchId}`),
  getExecution: (jobId: string) => request<ExecutionStatus>(`/executions/${jobId}`),
  scheduledExecutions: (testCaseId: string) =>
    request<ScheduledExecution[]>(`/executions/scheduled?testCaseId=${encodeURIComponent(testCaseId)}`),
  cancelScheduledExecution: (jobId: string) =>
    request<void>(`/executions/scheduled/${jobId}`, { method: "DELETE" }),
  testRuns: (limit = 50, testCaseId?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (testCaseId) params.set("testCaseId", testCaseId);
    return request<TestRunHistoryItem[]>(`/test-runs?${params.toString()}`);
  },
  reportRuns: () => request<ReportRun[]>("/test-runs/report?limit=1000"),
  reportRun: (runId: string) => request<ReportRun>(`/test-runs/${runId}`),
};

export type TestSuiteInput = {
  name: string;
  description?: string;
};

export type TestSuiteSummary = {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
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
  environmentId?: string | null;
  authProfileId?: string | null;
  startPath?: string;
  expectedResult?: string | null;
  category?: TestCaseCategory;
  scenario?: TestCaseScenario;
  storageSeeds?: StorageEntry[];
  storageAssertions?: StorageEntry[];
  accessibilityEnabled?: boolean;
  networkCheckEnabled?: boolean;
};

export type TestCaseSummary = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category?: TestCaseCategory;
  scenario?: TestCaseScenario;
  automationStatus: string;
  testFile?: string | null;
  environmentId?: string | null;
  authProfileId?: string | null;
  startPath?: string;
  resolvedStartUrl?: string | null;
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
