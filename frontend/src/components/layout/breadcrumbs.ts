import type { EntityKind } from "@/components/layout/shell-context";

/** A crumb is either fixed text or an entity whose name is resolved by the shell. */
export type CrumbSpec = {
  /** Link target; omitted for the last crumb. */
  to?: string;
  label?: string;
  entity?: { kind: EntityKind; id: string; projectId?: string };
  /** For a run crumb: insert its parent test case (resolved from the run) before it. */
  withRunParent?: boolean;
};

/**
 * Single route map for every route under `src/app`. Returns crumb specs;
 * the Breadcrumbs component resolves entity names and drops the last link.
 */
export function crumbsForPath(pathname: string, search?: URLSearchParams | null): CrumbSpec[] {
  const parts = pathname.split("/").filter(Boolean);
  const [root, id, section, child, leaf] = parts;

  switch (root) {
    case "dashboard":
      return [{ label: "Dashboard", to: "/dashboard" }];
    case "reports":
      return [{ label: "Reports", to: "/reports" }];
    case "settings":
      return [{ label: "Settings", to: "/settings" }];
    case "search": {
      const query = search?.get("q")?.trim();
      return [{ label: "Search", to: "/search" }, ...(query ? [{ label: `“${query}”` }] : [])];
    }
    case "workers":
      return [{ label: "Runners", to: "/workers" }];
    case "runs": {
      const crumbs: CrumbSpec[] = [{ label: "Test runs", to: "/runs" }];
      if (id === "batches" && section) crumbs.push({ label: `Run #${section.slice(0, 8)}` });
      return crumbs;
    }
    case "projects":
      break;
    default:
      return [];
  }

  const crumbs: CrumbSpec[] = [{ label: "Projects", to: "/projects" }];
  if (!id) return crumbs;
  const base = `/projects/${id}`;
  crumbs.push({ entity: { kind: "project", id }, to: base });

  switch (section) {
    case undefined:
      break;
    case "test-cases":
      crumbs.push({ label: "Test cases", to: `${base}/test-cases` });
      if (child === "new") crumbs.push({ label: "New test case" });
      else if (child) crumbs.push({ entity: { kind: "testCase", id: child, projectId: id }, to: `${base}/test-cases/${child}` });
      break;
    case "suites":
      crumbs.push({ label: "Suites", to: `${base}/suites` });
      if (child === "review") crumbs.push({ label: "Review suggestions", to: `${base}/suites/review` });
      else if (child) crumbs.push({ entity: { kind: "suite", id: child, projectId: id }, to: `${base}/suites/${child}` });
      break;
    case "environments":
      crumbs.push({ label: "Environments", to: `${base}/environments` });
      break;
    case "auth-profiles":
      crumbs.push({ label: "Auth profiles", to: `${base}/auth-profiles` });
      break;
    case "results":
      crumbs.push({ label: "Test cases", to: `${base}/test-cases` });
      if (child) crumbs.push({ entity: { kind: "run", id: child, projectId: id }, withRunParent: true });
      break;
    case "runs":
      if (child && leaf === "live") crumbs.push({ label: "Live run" });
      break;
    default:
      break;
  }
  return crumbs;
}
