"use client";

import { LoadingArea } from "@/components/common/LoadingArea";
import { useMemo, useState } from "react";
import { ArrowRight, SearchX } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "@/lib/navigation";
import type { SearchGroup, SearchItem, SearchResultType } from "@/lib/api";
import { SEARCH_SCOPES, isSearchScope, scopePlural, searchItemHref, searchPageHref, type SearchScope } from "@/lib/search";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import { PageContainer, PageHeader, SectionHeader } from "@/components/layout/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, createDataTableColumns, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/common/EmptyState";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";
import { Highlight, SearchTypeIcon } from "@/components/search/search-result-parts";

const helper = createDataTableColumns<SearchItem>();

function formatUpdated(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function buildColumns(query: string): DataTableColumn<SearchItem>[] {
  return [
    helper.accessor("title", {
      header: "Name",
      cell: (info) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <SearchTypeIcon type={info.row.original.type} />
          <span className="min-w-0">
            <Highlight text={info.getValue()} query={query} className="block truncate font-medium" />
            {info.row.original.subtitle ? (
              <span className="block truncate text-xs text-muted-foreground">{info.row.original.subtitle}</span>
            ) : null}
          </span>
        </span>
      ),
      meta: { className: "max-w-[480px]" },
    }),
    helper.accessor((row) => row.projectName ?? "", {
      id: "project",
      header: "Project",
      cell: (info) => <span className="text-muted-foreground">{info.getValue() || "—"}</span>,
    }),
    helper.accessor((row) => row.status ?? "", {
      id: "status",
      header: "Status",
      cell: (info) => (info.getValue() ? <RunStatusBadge status={info.getValue()} /> : <span className="text-faint">—</span>),
    }),
    helper.accessor((row) => row.updatedAt ?? "", {
      id: "updated",
      header: "Updated",
      sortFn: "datetime",
      cell: (info) => <span className="text-muted-foreground tabular-nums">{formatUpdated(info.getValue())}</span>,
      meta: { align: "right" },
    }),
  ];
}

function GroupList({ group, query, projectId }: { group: SearchGroup; query: string; projectId?: string | null }) {
  return (
    <section className="space-y-2">
      <SectionHeader
        as="h3"
        title={group.label}
        count={group.total}
        actions={
          group.total > group.items.length ? (
            <Link to={searchPageHref(query, group.type, projectId)} className="inline-flex items-center gap-1 text-[13px] text-brand-accent hover:underline">
              See all {group.total} {scopePlural(group.type)} <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          ) : null
        }
      />
      <ul className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border bg-surface">
        {group.items.map((item) => (
          <li key={`${item.type}:${item.id}`}>
            <Link
              to={searchItemHref(item)}
              className="flex items-center gap-3 px-3 py-2.5 transition-colors duration-150 hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none"
            >
              <SearchTypeIcon type={item.type} />
              <span className="min-w-0 flex-1">
                <Highlight text={item.title} query={query} className="block truncate text-[13px] font-medium" />
                <span className="block truncate text-xs text-muted-foreground">{item.subtitle || item.projectName || ""}</span>
              </span>
              {item.status ? <RunStatusBadge status={item.status} /> : null}
              <span className="hidden w-40 text-right text-xs text-muted-foreground tabular-nums sm:block">{formatUpdated(item.updatedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <div className="space-y-px overflow-hidden rounded-lg border border-border bg-surface">
            {Array.from({ length: 4 }, (__, row) => (
              <div key={row} className="flex items-center gap-3 px-3 py-2.5">
                <Skeleton className="size-7 rounded-md" />
                <Skeleton className="h-3.5 w-1/3" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Full search results: URL-driven (`/search?q=&type=&projectId=`), tabs per type. */
export function SearchPage() {
  const params = useSearchParams();
  const navigate = useNavigate();
  const query = params?.get("q") ?? "";
  const typeParam = params?.get("type");
  const scope: SearchScope = isSearchScope(typeParam) ? typeParam : "all";
  const projectId = params?.get("projectId") || null;
  const [draft, setDraft] = useState(query);
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    // URL changed from outside (header search, back/forward): sync the field.
    setLastQuery(query);
    setDraft(query);
  }

  // Counts for the tabs always come from the "all" search; a single-type tab loads up to 50 rows.
  const all = useGlobalSearch(query, { scope: "all", projectId, limit: 5, minLength: 1, debounceMs: 0 });
  const typed = useGlobalSearch(query, { scope, projectId, limit: 50, minLength: 1, debounceMs: 0, enabled: scope !== "all" });
  const columns = useMemo(() => buildColumns(query), [query]);

  const totals = useMemo(() => {
    const map = new Map<SearchResultType, number>();
    all.data?.groups.forEach((group) => map.set(group.type, group.total));
    return map;
  }, [all.data]);
  const grandTotal = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);

  function setUrl(nextQuery: string, nextScope: SearchScope) {
    navigate(searchPageHref(nextQuery, nextScope, projectId), { replace: true });
  }

  const typedRows = typed.data?.groups.find((group) => group.type === scope)?.items ?? [];
  const allGroups = all.data?.groups.filter((group) => group.items.length > 0) ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="Search"
        description={
          query
            ? `Results for “${query}”${projectId ? " in this project" : ""}`
            : "Search across projects, test suites, test cases and runs."
        }
      />
      <Toolbar
        search={
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setUrl(draft.trim(), scope);
            }}
          >
            <SearchInput value={draft} onChange={setDraft} placeholder="Search tests, runs, projects…" autoFocus={!query} />
          </form>
        }
      />
      <Tabs value={scope} onValueChange={(value) => setUrl(query, value as SearchScope)}>
        <TabsList variant="line" className="w-full justify-start gap-1 border-b border-border">
          {SEARCH_SCOPES.map((item) => {
            const count = item.value === "all" ? grandTotal : totals.get(item.value);
            return (
              <TabsTrigger key={item.value} value={item.value} className="flex-none px-3">
                {item.label}
                {query && all.status === "success" ? (
                  <span className="rounded-sm bg-elevated px-1.5 text-xs text-muted-foreground tabular-nums">{count ?? 0}</span>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {!query ? (
        <EmptyState variant="panel" icon={SearchX} title="Start typing to search" description="Find projects, test suites, test cases and runs by name, code or URL." />
      ) : scope === "all" ? (
        all.status === "error" ? (
          <Alert variant="error" title="Search failed">{all.error}</Alert>
        ) : !all.data ? (
          <LoadingArea loading label="Searching…" skeleton={<ResultsSkeleton />} />
        ) : allGroups.length === 0 ? (
          <EmptyState variant="panel" icon={SearchX} title={`No matches for “${query}”`} description="Try a different term, or search in all types." />
        ) : (
          <div className="space-y-8">
            {allGroups.map((group) => (
              <GroupList key={group.type} group={group} query={query} projectId={projectId} />
            ))}
          </div>
        )
      ) : typed.status === "error" ? (
        <Alert variant="error" title="Search failed">{typed.error}</Alert>
      ) : (
        <DataTable
          columns={columns}
          data={typedRows}
          getRowId={(row) => `${row.type}:${row.id}`}
          loading={!typed.data}
          onRowClick={(row) => navigate(searchItemHref(row))}
          rowLabel={(row) => `Open ${row.title}`}
          empty={<EmptyState icon={SearchX} title={`No ${scopePlural(scope)} match “${query}”`} size="sm" />}
        />
      )}
    </PageContainer>
  );
}

export default SearchPage;
