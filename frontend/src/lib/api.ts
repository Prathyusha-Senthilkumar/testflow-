import { supabase } from "./supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8001/api";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network request failed";
    throw new Error(
      message === "Failed to fetch"
        ? `Could not reach the API at ${API_URL}. Is the backend running on port 8001?`
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
};

export type AuthSessionStatus = "none" | "active" | "expiring" | "expired";

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
  createdAt: string;
};

export type UpdateTestCaseInput = {
  environmentId?: string | null;
  authProfileId?: string | null;
  startPath?: string;
  expectedResult?: string | null;
  category?: TestCaseCategory;
  scenario?: TestCaseScenario;
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
