import {
  api,
  type SearchGroup,
  type SearchItem,
  type SearchOptions,
  type SearchResponse,
  type SearchResultType,
} from "./api";

/* ------------------------------------------------------------------ */
/* Types, labels, routes                                               */
/* ------------------------------------------------------------------ */

export type SearchScope = SearchResultType | "all";

export const SEARCH_SCOPES: { value: SearchScope; label: string; plural: string }[] = [
  { value: "all", label: "All", plural: "All" },
  { value: "project", label: "Projects", plural: "projects" },
  { value: "suite", label: "Test suites", plural: "test suites" },
  { value: "test_case", label: "Test cases", plural: "test cases" },
  { value: "run", label: "Test runs", plural: "test runs" },
];

export function scopeLabel(scope: SearchScope): string {
  return SEARCH_SCOPES.find((item) => item.value === scope)?.label ?? "All";
}

export function scopePlural(scope: SearchScope): string {
  return SEARCH_SCOPES.find((item) => item.value === scope)?.plural ?? "results";
}

export function isSearchScope(value: string | null | undefined): value is SearchScope {
  return SEARCH_SCOPES.some((item) => item.value === value);
}

/** App route for a search result. */
export function searchItemHref(item: Pick<SearchItem, "type" | "id" | "projectId">): string {
  switch (item.type) {
    case "project":
      return `/projects/${item.id}`;
    case "suite":
      return `/projects/${item.projectId}/suites/${item.id}`;
    case "test_case":
      return `/projects/${item.projectId}/test-cases/${item.id}`;
    case "run":
      return `/projects/${item.projectId}/results/${item.id}`;
  }
}

/** URL of the full results page. */
export function searchPageHref(query: string, scope: SearchScope = "all", projectId?: string | null): string {
  const params = new URLSearchParams({ q: query });
  if (scope !== "all") params.set("type", scope);
  if (projectId) params.set("projectId", projectId);
  return `/search?${params.toString()}`;
}

/** Splits `text` into segments, flagging case-insensitive matches of `query`. */
export function highlightSegments(text: string, query: string): { text: string; match: boolean }[] {
  const needle = query.trim();
  if (!needle) return [{ text, match: false }];
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .split(new RegExp(`(${escaped})`, "ig"))
    .filter(Boolean)
    .map((part) => ({ text: part, match: part.toLowerCase() === needle.toLowerCase() }));
}

/* ------------------------------------------------------------------ */
/* Search with a temporary client-side fallback                        */
/* ------------------------------------------------------------------ */

const GROUP_LABELS: Record<SearchResultType, string> = {
  project: "Projects",
  suite: "Test suites",
  test_case: "Test cases",
  run: "Test runs",
};

function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = query.trim().toLowerCase();
  return fields.some((field) => field?.toLowerCase().includes(needle));
}

function group(type: SearchResultType, all: SearchItem[], limit: number): SearchGroup {
  return { type, label: GROUP_LABELS[type], total: all.length, items: all.slice(0, limit) };
}

/**
 * TEMPORARY: searches the cached list endpoints in the browser while the
 * backend `GET /search` endpoint is not deployed. Covers projects, plus suites
 * and test cases of the scoped project. Remove once `/search` is live everywhere.
 */
async function clientFallbackSearch(query: string, options: SearchOptions): Promise<SearchResponse> {
  const scope = options.type ?? "all";
  const limit = options.limit ?? 5;
  const wants = (type: SearchResultType) => scope === "all" || scope === type;
  const projects = await api.projects();
  const scopedProjects = options.projectId ? projects.filter((item) => item.id === options.projectId) : projects;
  const groups: SearchGroup[] = [];

  if (wants("project")) {
    const items: SearchItem[] = scopedProjects
      .filter((item) => matches(query, item.name, item.baseUrl, item.description))
      .map((item) => ({ id: item.id, type: "project", title: item.name, subtitle: item.baseUrl, projectId: item.id, projectName: item.name, updatedAt: item.lastRun }));
    if (items.length) groups.push(group("project", items, limit));
  }

  // Suites and test cases are per-project endpoints; only search them when scoped to a project.
  const project = options.projectId ? projects.find((item) => item.id === options.projectId) : undefined;
  if (project && (wants("suite") || wants("test_case"))) {
    const [suites, cases] = await Promise.all([
      wants("suite") ? api.testSuites(project.id) : Promise.resolve([]),
      wants("test_case") ? api.testCases(project.id) : Promise.resolve([]),
    ]);
    const suiteItems: SearchItem[] = suites
      .filter((item) => matches(query, item.name, item.description))
      .map((item) => ({ id: item.id, type: "suite", title: item.name, subtitle: `${item.caseCount} test cases · ${project.name}`, projectId: project.id, projectName: project.name, updatedAt: item.createdAt }));
    if (suiteItems.length) groups.push(group("suite", suiteItems, limit));
    const caseItems: SearchItem[] = cases
      .filter((item) => matches(query, item.code, item.name, item.description))
      .map((item) => ({ id: item.id, type: "test_case", title: `${item.code} ${item.name}`, subtitle: project.name, projectId: project.id, projectName: project.name }));
    if (caseItems.length) groups.push(group("test_case", caseItems, limit));
  }

  return { query, type: scope, groups };
}

function isMissingEndpoint(error: unknown): boolean {
  return error instanceof Error && /not found/i.test(error.message);
}

/** Global search. Uses `GET /search`; falls back to a client-side search if the endpoint is missing. */
export async function globalSearch(query: string, options: SearchOptions = {}, signal?: AbortSignal): Promise<SearchResponse> {
  try {
    return await api.search(query, options, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (isMissingEndpoint(error)) return clientFallbackSearch(query, options);
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* Recent items (per account, localStorage)                            */
/* ------------------------------------------------------------------ */

export type RecentItem = {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle?: string;
  projectId?: string;
  at: number;
};

const RECENT_LIMIT = 8;
const RECENT_EVENT = "testflow-recent";

function recentKey(userId: string) {
  return `testflow.recent.${userId}`;
}

export function readRecent(userId: string | null | undefined): RecentItem[] {
  if (!userId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(recentKey(userId));
    const parsed = raw ? (JSON.parse(raw) as RecentItem[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

/** Moves (or adds) an item to the top of the user's recent list. */
export function recordRecent(userId: string | null | undefined, item: Omit<RecentItem, "at">) {
  if (!userId || typeof window === "undefined") return;
  try {
    const current = readRecent(userId);
    const top = current[0];
    if (top && top.type === item.type && top.id === item.id && top.title === item.title) return;
    const next = [{ ...item, at: Date.now() }, ...current.filter((entry) => !(entry.type === item.type && entry.id === item.id))].slice(0, RECENT_LIMIT);
    window.localStorage.setItem(recentKey(userId), JSON.stringify(next));
    window.dispatchEvent(new Event(RECENT_EVENT));
  } catch {
    // Storage unavailable: recent items simply aren't remembered.
  }
}

export function subscribeRecent(callback: () => void): () => void {
  window.addEventListener(RECENT_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(RECENT_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
