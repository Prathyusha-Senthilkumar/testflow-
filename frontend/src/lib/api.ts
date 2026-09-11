import { supabase } from "./supabase";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = Array.isArray(payload.message)
      ? payload.message.join(", ")
      : payload.message ?? "Request failed";
    throw new Error(message);
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
  createProject: (input: ProjectInput) =>
    request<ProjectDetail>("/projects", { method: "POST", body: JSON.stringify(input) }),
  updateProject: (id: string, input: Partial<ProjectInput>) =>
    request<ProjectDetail>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
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
