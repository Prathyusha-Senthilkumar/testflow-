"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "@/lib/navigation";
import { api } from "@/lib/api";
import { recordRecent } from "@/lib/search";
import { useAccount } from "@/hooks/useAccount";

/** Kinds of entity whose display name the shell shows (breadcrumbs, sidebar, recent items). */
export type EntityKind = "project" | "suite" | "testCase" | "run";

export type EntityInfo = {
  name: string;
  /** For runs: the test case the run belongs to (breadcrumb parent). */
  testCaseId?: string;
};

type ShellContextValue = {
  /** Project in the current URL (`/projects/[id]/...`). `name` is "" until known. */
  project: { id: string; name: string } | null;
  entities: Record<string, EntityInfo>;
  setEntity: (kind: EntityKind, id: string, info: EntityInfo) => void;
  /** Requests a one-time fallback lookup for an entity no view has published. */
  requestLookup: (kind: EntityKind, id: string, projectId?: string) => void;
};

const noop = () => {};
const ShellContext = createContext<ShellContextValue>({ project: null, entities: {}, setEntity: noop, requestLookup: noop });

const entityKey = (kind: EntityKind, id: string) => `${kind}:${id}`;

/** Parses `/projects/[id]` out of a pathname. */
export function projectIdFromPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts[0] === "projects" && parts[1] ? parts[1] : "";
}

function formatRunLabel(startedAt?: string | null): string {
  if (!startedAt) return "Run";
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) return "Run";
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  const day = date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `Run ${time}, ${day}`;
}

/** Label for a test case in chrome: "TC-007 Open assessments". */
export function testCaseLabel(code: string | null | undefined, name: string | null | undefined): string {
  return [code, name].filter(Boolean).join(" ") || "Test case";
}

/** Label for a run in chrome: "Run 14:03, 8 Oct". */
export const runLabel = formatRunLabel;

/** One-time fallback lookups using list endpoints (served from the GET cache when warm). */
async function lookup(kind: EntityKind, id: string, projectId?: string): Promise<EntityInfo> {
  if (kind === "project") {
    // Race the (usually cached) projects list against the project detail; first real name wins.
    const fromList = api.projects().then((items) => {
      const name = items.find((item) => item.id === id)?.name;
      if (!name) throw new Error("not in list");
      return name;
    });
    const fromDetail = api.project(id).then((item) => {
      if (!item?.name) throw new Error("no name");
      return item.name;
    });
    const name = await Promise.any([fromList, fromDetail]).catch(() => "Project");
    return { name };
  }
  if (kind === "suite" && projectId) {
    const items = await api.testSuites(projectId);
    return { name: items.find((item) => item.id === id)?.name ?? "Test suite" };
  }
  if (kind === "testCase" && projectId) {
    const items = await api.testCases(projectId);
    const match = items.find((item) => item.id === id);
    return { name: match ? testCaseLabel(match.code, match.name) : "Test case" };
  }
  if (kind === "run") {
    const run = await api.reportRun(id);
    return { name: formatRunLabel(run.startedAt), testCaseId: run.testCaseId ?? undefined };
  }
  return { name: "" };
}

const FALLBACK_DELAY_MS = 400;
/** Never leave a name loading longer than this; fall back to a generic label. */
const LOOKUP_TIMEOUT_MS = 4000;

function fallbackLabel(kind: EntityKind): string {
  return kind === "project" ? "Project" : kind === "suite" ? "Test suite" : kind === "testCase" ? "Test case" : "Run";
}

/** The "detail" entity a route is about, if any (used for recent items). */
function leafEntityFromPath(pathname: string): { kind: EntityKind; id: string; projectId: string } | null {
  const [root, projectId, section, child] = pathname.split("/").filter(Boolean);
  if (root !== "projects" || !projectId) return null;
  if (!section) return { kind: "project", id: projectId, projectId };
  if (section === "suites" && child && child !== "review") return { kind: "suite", id: child, projectId };
  if (section === "test-cases" && child && child !== "new") return { kind: "testCase", id: child, projectId };
  if (section === "results" && child) return { kind: "run", id: child, projectId };
  return null;
}

/**
 * Holds display names for entities in the URL. Views publish names from data
 * they already loaded (`usePublishEntityName`); anything not published within
 * a moment is looked up once via a cached list endpoint, so the chrome never
 * shows a generic placeholder for long and never fires slow detail requests.
 */
export function ShellProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const projectId = projectIdFromPath(pathname);
  const [entities, setEntities] = useState<Record<string, EntityInfo>>({});
  const entitiesRef = useRef(entities);
  const attempted = useRef(new Set<string>());
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    entitiesRef.current = entities;
  }, [entities]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      // Clear the keys too: under StrictMode the provider remounts, and stale keys
      // would make requestLookup skip every later request.
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const setEntity = useCallback((kind: EntityKind, id: string, info: EntityInfo) => {
    const key = entityKey(kind, id);
    setEntities((current) => {
      const existing = current[key];
      if (existing && existing.name === info.name && existing.testCaseId === (info.testCaseId ?? existing.testCaseId)) return current;
      return { ...current, [key]: { ...existing, ...info } };
    });
  }, []);

  const requestLookup = useCallback(
    (kind: EntityKind, id: string, lookupProjectId?: string) => {
      const key = entityKey(kind, id);
      if (attempted.current.has(key) || timers.current.has(key)) return;
      // Projects are looked up immediately (the sidebar and breadcrumbs need them on every page);
      // other entities give the view a moment to publish first.
      const delay = kind === "project" ? 0 : FALLBACK_DELAY_MS;
      const timer = window.setTimeout(() => {
        timers.current.delete(key);
        if (entitiesRef.current[key]?.name) return;
        attempted.current.add(key);
        const generic = fallbackLabel(kind);
        // A generic label may later be replaced by the real name; a real name is never overwritten.
        const settle = (info: EntityInfo) => {
          const current = entitiesRef.current[key]?.name;
          if (current && current !== generic) return;
          setEntity(kind, id, info.name ? info : { ...info, name: generic });
        };
        const timer = window.setTimeout(() => settle({ name: generic }), LOOKUP_TIMEOUT_MS);
        lookup(kind, id, lookupProjectId)
          .then(settle)
          .catch((error: unknown) => {
            console.warn(`[Attest] Couldn't resolve ${kind} name`, error);
            settle({ name: generic });
          })
          .finally(() => window.clearTimeout(timer));
      }, delay);
      timers.current.set(key, timer);
    },
    [setEntity]
  );

  const projectName = projectId ? (entities[entityKey("project", projectId)]?.name ?? "") : "";
  useEffect(() => {
    if (projectId && !projectName) requestLookup("project", projectId);
  }, [projectId, projectName, requestLookup]);

  // Record the page's leaf entity (project, suite, test case, run) as a recent item once its name is known.
  const account = useAccount();
  const leaf = leafEntityFromPath(pathname);
  const leafInfo = leaf ? entities[entityKey(leaf.kind, leaf.id)] : undefined;
  const leafProjectName = projectName;
  useEffect(() => {
    if (!account?.userId || !leaf || !leafInfo?.name) return;
    const type = leaf.kind === "testCase" ? "test_case" : leaf.kind;
    recordRecent(account.userId, {
      type,
      id: leaf.id,
      title: leafInfo.name,
      subtitle: leaf.kind === "project" ? undefined : leafProjectName || undefined,
      projectId: leaf.projectId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the primitive parts of `leaf`
  }, [account?.userId, leaf?.kind, leaf?.id, leaf?.projectId, leafInfo?.name, leafProjectName]);

  const value = useMemo<ShellContextValue>(
    () => ({
      project: projectId ? { id: projectId, name: projectName } : null,
      entities,
      setEntity,
      requestLookup,
    }),
    [projectId, projectName, entities, setEntity, requestLookup]
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell() {
  return useContext(ShellContext);
}

/**
 * Display info for an entity; triggers the one-time fallback lookup when no
 * view has published it. Returns `undefined` while unknown (render a skeleton).
 */
export function useEntity(kind: EntityKind, id: string | undefined, projectId?: string): EntityInfo | undefined {
  const { entities, requestLookup } = useContext(ShellContext);
  const info = id ? entities[entityKey(kind, id)] : undefined;
  const known = Boolean(info?.name);
  useEffect(() => {
    if (id && !known) requestLookup(kind, id, projectId);
  }, [kind, id, projectId, known, requestLookup]);
  return known ? info : undefined;
}

/** Display name for an entity, or "" while unknown. */
export function useEntityName(kind: EntityKind, id: string | undefined, projectId?: string): string {
  return useEntity(kind, id, projectId)?.name ?? "";
}

/**
 * Publishes an entity's display name to the shell (breadcrumbs, sidebar,
 * recent items). Call from views with data they already fetched. For runs,
 * pass `{ testCaseId }` so breadcrumbs can link the parent test case.
 */
export function usePublishEntityName(
  kind: EntityKind,
  id: string | undefined | null,
  name: string | undefined | null,
  extra?: { testCaseId?: string | null }
) {
  const { setEntity } = useContext(ShellContext);
  const testCaseId = extra?.testCaseId ?? undefined;
  useEffect(() => {
    if (id && name) setEntity(kind, id, { name, testCaseId });
  }, [kind, id, name, testCaseId, setEntity]);
}

/**
 * Static shell context for Storybook and tests: fixed project/entity names,
 * no fallback lookups (unpublished names stay in their loading state).
 */
export function StaticShellProvider({
  project = null,
  names = {},
  children,
}: {
  project?: { id: string; name: string } | null;
  /** Keyed as `${kind}:${id}`, e.g. `{ "suite:s1": { name: "Assessments" } }`. */
  names?: Record<string, EntityInfo>;
  children: ReactNode;
}) {
  const value = useMemo<ShellContextValue>(
    () => ({
      project,
      entities: { ...(project?.name ? { [entityKey("project", project.id)]: { name: project.name } } : {}), ...names },
      setEntity: noop,
      requestLookup: noop,
    }),
    [project, names]
  );
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}
