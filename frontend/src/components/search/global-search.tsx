"use client";

import { friendlyRunError } from "@/lib/friendlyRunError";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { ArrowRight, ChevronDown, Clock, CornerDownLeft, FolderKanban, Search, X } from "lucide-react";
import { useNavigate } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { SearchResponse } from "@/lib/api";
import {
  SEARCH_SCOPES,
  scopeLabel,
  scopePlural,
  searchItemHref,
  searchPageHref,
  type RecentItem,
  type SearchScope,
} from "@/lib/search";
import { useGlobalSearch, type GlobalSearchState } from "@/hooks/useGlobalSearch";
import { useRecentItems } from "@/hooks/useRecentItems";
import { useAccount } from "@/hooks/useAccount";
import { Kbd } from "@/components/ui/kbd";
import { AttestLoader } from "@/components/brand/attest-loader";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";
import { useShell } from "@/components/layout/shell-context";
import { filterQuickActions, useQuickActions, type QuickAction } from "@/components/search/quick-actions";
import { Highlight, SearchTypeIcon } from "@/components/search/search-result-parts";

const MIN_QUERY = 2;
const SEE_ALL_VALUE = "__see_all__";

/* ------------------------------------------------------------------ */
/* Presentational results panel (also used directly by Storybook)      */
/* ------------------------------------------------------------------ */

type ResultsPanelProps = {
  query: string;
  scope: SearchScope;
  state: GlobalSearchState;
  recent: RecentItem[];
  actions: QuickAction[];
  /** Navigate to an app route and close. */
  onOpen: (href: string) => void;
  onAction: (action: QuickAction) => void;
  projectId?: string | null;
};

function GroupHeading({ children }: { children: ReactNode }) {
  return <span className="flex items-center justify-between gap-2">{children}</span>;
}

const groupClasses =
  "px-1.5 py-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-faint [&_[cmdk-group-heading]]:uppercase";

const itemClasses =
  "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-foreground outline-none select-none data-[selected=true]:bg-state-active data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50";

function ActionItems({ actions, onAction }: { actions: QuickAction[]; onAction: (action: QuickAction) => void }) {
  return (
    <>
      {actions.map((action) => (
        <CommandPrimitive.Item key={action.id} value={action.id} onSelect={() => onAction(action)} className={itemClasses}>
          <action.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{action.label}</span>
          <span className="ml-auto text-xs text-faint">{action.group}</span>
        </CommandPrimitive.Item>
      ))}
    </>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-1 p-2" aria-hidden>
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex items-center gap-2.5 px-2 py-1.5">
          <Skeleton className="size-7 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Results({ data, query, onOpen, projectId }: { data: SearchResponse; query: string; onOpen: (href: string) => void; projectId?: string | null }) {
  const groups = data.groups.filter((group) => group.items.length > 0);
  if (groups.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
        No matches for “<span className="text-foreground">{query.trim()}</span>”
      </div>
    );
  }
  return (
    <>
      {groups.map((group) => (
        <CommandPrimitive.Group
          key={group.type}
          className={groupClasses}
          heading={
            <GroupHeading>
              <span>
                {group.label} · <span className="tabular-nums">{group.total}</span>
              </span>
            </GroupHeading>
          }
        >
          {group.items.map((item) => (
            <CommandPrimitive.Item
              key={`${item.type}:${item.id}`}
              value={`${item.type}:${item.id}`}
              onSelect={() => onOpen(searchItemHref(item))}
              className={itemClasses}
            >
              <SearchTypeIcon type={item.type} />
              <span className="min-w-0 flex-1">
                <Highlight text={item.title} query={query} className="block truncate" />
                {item.subtitle || item.projectName ? (
                  <span className="block truncate text-xs text-muted-foreground" title={item.subtitle ?? undefined}>
                    {item.type === "run" && item.subtitle ? friendlyRunError(item.subtitle) : item.subtitle || item.projectName}
                  </span>
                ) : null}
              </span>
              {item.status ? <RunStatusBadge status={item.status} /> : null}
            </CommandPrimitive.Item>
          ))}
          {group.total > group.items.length ? (
            <CommandPrimitive.Item
              value={`see-all:${group.type}`}
              onSelect={() => onOpen(searchPageHref(query.trim(), group.type, projectId))}
              className={cn(itemClasses, "text-brand-accent")}
            >
              <span className="pl-[38px]">
                See all <span className="tabular-nums">{group.total}</span> {scopePlural(group.type)}
              </span>
              <ArrowRight className="size-3.5" aria-hidden />
            </CommandPrimitive.Item>
          ) : null}
        </CommandPrimitive.Group>
      ))}
    </>
  );
}

/** The dropdown content: recent + quick actions, command mode, or grouped results. */
export function GlobalSearchResults({ query, scope, state, recent, actions, onOpen, onAction, projectId }: ResultsPanelProps) {
  const trimmed = query.trim();
  const commandMode = trimmed.startsWith(">");
  const searching = !commandMode && trimmed.length >= MIN_QUERY;

  let body: ReactNode;
  if (commandMode) {
    const matches = filterQuickActions(actions, trimmed.slice(1));
    body = matches.length ? (
      <CommandPrimitive.Group heading="Quick actions" className={groupClasses}>
        <ActionItems actions={matches} onAction={onAction} />
      </CommandPrimitive.Group>
    ) : (
      <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">No matching actions</div>
    );
  } else if (!searching) {
    body = (
      <>
        {recent.length ? (
          <CommandPrimitive.Group heading="Recent" className={groupClasses}>
            {recent.map((item) => (
              <CommandPrimitive.Item
                key={`recent:${item.type}:${item.id}`}
                value={`recent:${item.type}:${item.id}`}
                onSelect={() => onOpen(searchItemHref(item))}
                className={itemClasses}
              >
                <SearchTypeIcon type={item.type} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.title}</span>
                  {item.subtitle ? <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span> : null}
                </span>
                <Clock className="size-3.5 text-faint" aria-hidden />
              </CommandPrimitive.Item>
            ))}
          </CommandPrimitive.Group>
        ) : null}
        <p className="px-4 py-3 text-[13px] text-muted-foreground">
          Search for projects, suites, test cases and runs. Type <Kbd className="border border-border">&gt;</Kbd> for actions.
        </p>
        <CommandPrimitive.Group heading="Quick actions" className={cn(groupClasses, "border-t border-border")}>
          <ActionItems actions={actions.filter((action) => action.group !== "Project").slice(0, 8)} onAction={onAction} />
        </CommandPrimitive.Group>
      </>
    );
  } else if (state.status === "error") {
    body = (
      <div className="p-3">
        <Alert variant="error" title="Search failed">
          {state.error}
        </Alert>
      </div>
    );
  } else if (state.data) {
    body = (
      <div className={cn(state.status === "loading" && "opacity-60 transition-opacity")}>
        <Results data={state.data} query={trimmed} onOpen={onOpen} projectId={projectId} />
      </div>
    );
  } else {
    body = <LoadingRows />;
  }

  return (
    <div className="flex max-h-[min(70vh,560px)] flex-col">
      <CommandPrimitive.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1" aria-label="Search results">
        {body}
      </CommandPrimitive.List>
      {searching ? (
        <div className="border-t border-border p-1.5">
          <CommandPrimitive.Item
            value={SEE_ALL_VALUE}
            onSelect={() => onOpen(searchPageHref(trimmed, scope, projectId))}
            className={cn(itemClasses, "justify-between")}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Search className="size-4 text-muted-foreground" aria-hidden />
              <span className="truncate">
                See all results for “<span className="font-medium">{trimmed}</span>”
                {scope !== "all" ? <span className="text-muted-foreground"> in {scopeLabel(scope).toLowerCase()}</span> : null}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-faint">
              <Kbd className="border border-border">
                <CornerDownLeft />
              </Kbd>
              open
              <Kbd className="ml-1.5 border border-border">⌘↵</Kbd>
              all results
            </span>
          </CommandPrimitive.Item>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Field + behaviour                                                   */
/* ------------------------------------------------------------------ */

function ScopePicker({ scope, onChange, onDone }: { scope: SearchScope; onChange: (scope: SearchScope) => void; onDone: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Search scope: ${scopeLabel(scope)}`}
        className="flex h-6 shrink-0 items-center gap-1 rounded-sm px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-elevated"
      >
        {scopeLabel(scope)}
        <ChevronDown className="size-3" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-40"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onDone();
        }}
      >
        <DropdownMenuRadioGroup value={scope} onValueChange={(value) => onChange(value as SearchScope)}>
          {SEARCH_SCOPES.map((item) => (
            <DropdownMenuRadioItem key={item.value} value={item.value} className="text-[13px]">
              {item.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type GlobalSearchProps = {
  /** `header`: inline field with an anchored dropdown. `sheet`: full-screen mobile layout. */
  variant?: "header" | "sheet";
  /** Called after navigating (e.g. to close the mobile sheet). */
  onNavigate?: () => void;
  className?: string;
};

/**
 * Salesforce-style global search: inline combobox in the header with a scope
 * picker, "This project" filter, recent items, grouped live results, and
 * quick actions (">" prefix). ⌘K or "/" focuses it.
 */
export function GlobalSearch({ variant = "header", onNavigate, className }: GlobalSearchProps) {
  const navigate = useNavigate();
  const account = useAccount();
  const recent = useRecentItems(account?.userId);
  const actions = useQuickActions();
  const { project } = useShell();
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(variant === "sheet");
  const [scope, setScope] = useState<SearchScope>("all");
  const [thisProject, setThisProject] = useState(true);
  const [active, setActive] = useState("");

  const projectId = project && thisProject ? project.id : null;
  const commandMode = query.trim().startsWith(">");
  const state = useGlobalSearch(query, { scope, projectId, enabled: !commandMode, minLength: MIN_QUERY });

  // ⌘K / Ctrl+K and "/" focus the header field.
  useEffect(() => {
    if (variant !== "header") return;
    function onKeyDown(event: KeyboardEvent) {
      const isCmdK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      const target = event.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      const isSlash = event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (!isCmdK && !isSlash) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
      setOpen(true);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [variant]);

  function close() {
    if (variant === "header") setOpen(false);
  }

  function openHref(href: string) {
    navigate(href);
    setQuery("");
    close();
    inputRef.current?.blur();
    onNavigate?.();
  }

  function runAction(action: QuickAction) {
    setQuery("");
    close();
    inputRef.current?.blur();
    onNavigate?.();
    action.perform();
  }

  const panel = (
    <GlobalSearchResults
      query={query}
      scope={scope}
      state={state}
      recent={recent}
      actions={actions}
      onOpen={openHref}
      onAction={runAction}
      projectId={projectId}
    />
  );

  const field = (
    <div
      ref={anchorRef}
      className={cn(
        "flex h-8 w-full items-center gap-1 rounded-md border border-border bg-surface pr-1.5 pl-1 text-[13px] transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25 hover:border-input",
        variant === "sheet" && "h-10"
      )}
    >
      <ScopePicker scope={scope} onChange={setScope} onDone={() => inputRef.current?.focus()} />
      <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
      <Search className="ml-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <CommandPrimitive.Input
        ref={inputRef}
        value={query}
        onValueChange={(value) => {
          setQuery(value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && query.trim().length >= MIN_QUERY && !commandMode) {
            event.preventDefault();
            openHref(searchPageHref(query.trim(), scope, projectId));
          }
          if (event.key === "Escape" && !open) inputRef.current?.blur();
        }}
        placeholder={variant === "sheet" ? "Search…" : "Search tests, runs, projects…"}
        aria-label="Global search"
        className="h-full min-w-0 flex-1 bg-transparent px-1 text-foreground outline-none placeholder:text-faint"
      />
      {project ? (
        <button
          type="button"
          aria-pressed={thisProject}
          onClick={() => {
            setThisProject((current) => !current);
            inputRef.current?.focus();
          }}
          title={thisProject ? `Searching in ${project.name || "this project"}. Click to search everywhere.` : "Search only this project"}
          className={cn(
            "flex h-6 max-w-36 shrink-0 items-center gap-1 rounded-sm border px-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            thisProject ? "border-brand-accent/30 bg-info-soft text-brand-accent" : "border-border text-muted-foreground hover:text-foreground"
          )}
        >
          <FolderKanban className="size-3 shrink-0" aria-hidden />
          <span className="truncate">This project</span>
          {thisProject ? <X className="size-3 shrink-0" aria-hidden /> : null}
        </button>
      ) : null}
      {query ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setQuery("");
            inputRef.current?.focus();
          }}
          className="grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-elevated hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : variant === "header" ? (
        <Kbd className="shrink-0 border border-border bg-elevated">⌘K</Kbd>
      ) : null}
      {state.status === "loading" ? <AttestLoader size="sm" label="Searching" className="mr-0.5" /> : null}
    </div>
  );

  if (variant === "sheet") {
    return (
      <CommandPrimitive shouldFilter={false} loop value={active} onValueChange={setActive} className={cn("flex min-h-0 flex-1 flex-col gap-2", className)}>
        {field}
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-popover">{panel}</div>
      </CommandPrimitive>
    );
  }

  return (
    <CommandPrimitive
      shouldFilter={false}
      loop
      value={active}
      onValueChange={setActive}
      className={cn("w-full", className)}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>{field}</PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={6}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            // Clicks inside the field (input, scope picker, chips) must not close the panel.
            if (anchorRef.current?.contains(event.target as Node)) event.preventDefault();
          }}
          className="w-(--radix-popover-trigger-width) overflow-hidden p-0"
        >
          {panel}
        </PopoverContent>
      </Popover>
    </CommandPrimitive>
  );
}
