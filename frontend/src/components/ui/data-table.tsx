"use client";

import * as React from "react";
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type CellData,
  type ColumnDef,
  type RowData,
  type SortingState,
  type TableFeatures,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { controlClasses } from "@/components/ui/input";
import { AttestLoader } from "@/components/brand/attest-loader";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<in out TFeatures extends TableFeatures, in out TData extends RowData, TValue extends CellData = CellData> {
    /** Classes applied to every body cell in this column. */
    className?: string;
    /** Classes applied to the header cell. */
    headerClassName?: string;
    /** Right-align numeric columns (also applies tabular-nums). */
    align?: "left" | "right" | "center";
  }
}

/** Stable feature set shared by every DataTable: client-side sorting + global search. */
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, datetime: sortFn_datetime },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
});

export type DataTableFeatures = typeof dataTableFeatures;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataTableColumn<TData extends RowData> = ColumnDef<DataTableFeatures, TData, any>;

/** Typed column helper for DataTable columns. Call at module scope. */
export function createDataTableColumns<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}

export type DataTableProps<TData extends RowData> = {
  /** Keep this stable (module scope or useMemo). */
  columns: DataTableColumn<TData>[];
  data: TData[];
  getRowId?: (row: TData, index: number) => string;
  /** Row click handler; rows become keyboard focusable links. */
  onRowClick?: (row: TData) => void;
  /** Accessible label for row activation, e.g. (row) => `Open ${row.name}`. */
  rowLabel?: (row: TData) => string;
  /**
   * First load (no data yet): faint skeleton rows with a centred Attest loader.
   * Refetch (data present): rows stay visible with a small loader in the corner.
   */
  loading?: boolean;
  /** Text under the first-load loader, e.g. "Loading test cases…". */
  loadingLabel?: string;
  /** Number of skeleton rows while loading. */
  skeletonRows?: number;
  /** Rendered when `data` itself is empty (nothing exists yet). */
  empty?: React.ReactNode;
  /** Rendered when rows exist but the search filters them all out. Defaults to a "No results" line. */
  emptyFiltered?: React.ReactNode;
  /** Controlled global search. Omit to let the table own it. */
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  /** Show a built-in search box in the toolbar. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Extra toolbar content (filters, actions), rendered right of the search. */
  toolbar?: React.ReactNode;
  initialSorting?: SortingState;
  /** Classes for the scroll container; give it a max-height for a sticky header inside a panel. */
  containerClassName?: string;
  className?: string;
  rowClassName?: (row: TData) => string | undefined;
  /** Minimum table width before horizontal scroll kicks in. */
  minWidth?: number;
  /**
   * Offset (px) for the sticky header when the table scrolls with the page,
   * e.g. the height of a sticky Toolbar above it. Ignored when
   * `containerClassName` gives the table its own scroll box.
   */
  stickyTop?: number;
};

const EMPTY_SORTING: SortingState = [];

/**
 * Reusable list table (TanStack Table v9): sortable headers, global search,
 * sticky header and toolbar, skeleton loading and a designed empty slot.
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  getRowId,
  onRowClick,
  rowLabel,
  loading = false,
  loadingLabel = "Loading…",
  skeletonRows = 6,
  empty,
  emptyFiltered,
  globalFilter: controlledFilter,
  onGlobalFilterChange,
  searchable = false,
  searchPlaceholder = "Search…",
  toolbar,
  initialSorting = EMPTY_SORTING,
  containerClassName,
  className,
  rowClassName,
  minWidth,
  stickyTop = 0,
}: DataTableProps<TData>) {
  const [internalFilter, setInternalFilter] = React.useState("");
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const filter = controlledFilter ?? internalFilter;
  const setFilter = React.useCallback(
    (value: string) => {
      if (onGlobalFilterChange) onGlobalFilterChange(value);
      if (controlledFilter === undefined) setInternalFilter(value);
    },
    [controlledFilter, onGlobalFilterChange]
  );

  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    getRowId,
    state: { sorting, globalFilter: filter },
    onSortingChange: (updater) => setSorting((prev) => (typeof updater === "function" ? updater(prev) : updater)),
    onGlobalFilterChange: (updater: unknown) => {
      const next = typeof updater === "function" ? (updater as (prev: string) => string)(filter) : updater;
      setFilter(typeof next === "string" ? next : "");
    },
    globalFilterFn: "includesString",
  });

  const rows = table.getRowModel().rows;
  const headerGroups = table.getHeaderGroups();
  const columnCount = headerGroups[0]?.headers.length ?? columns.length;
  const showToolbar = searchable || toolbar;

  return (
    <div data-slot="data-table" className={cn("flex min-w-0 flex-col", className)}>
      {showToolbar ? (
        <div className="flex flex-wrap items-center gap-2 pb-3">
          {searchable ? (
            <div className="relative w-full sm:w-72">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
              <input
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className={cn(controlClasses, "h-8 pl-8")}
              />
            </div>
          ) : null}
          {toolbar ? <div className="flex flex-1 flex-wrap items-center justify-end gap-2">{toolbar}</div> : null}
        </div>
      ) : null}
      {/* overflow-clip (not hidden) keeps the rounded corners without creating a scroll
          container, so the header can stick to the scrolling page canvas. */}
      <div className="relative overflow-clip rounded-lg border border-border bg-surface">
        {loading && data.length > 0 ? <AttestLoader size="sm" label="Refreshing rows" className="absolute top-2.5 right-3 z-20" /> : null}
        {loading && data.length === 0 ? (
          <div role="status" className="pointer-events-none absolute inset-x-0 top-9 bottom-0 z-20 flex flex-col items-center justify-center gap-2">
            <AttestLoader size="md" decorative />
            <span className="text-[13px] text-muted-foreground">{loadingLabel}</span>
          </div>
        ) : null}
        <Table
          containerClassName={containerClassName ?? "overflow-x-auto lg:overflow-visible"}
          style={minWidth ? { minWidth } : undefined}
        >
          <TableHeader
            className="sticky z-10 bg-elevated shadow-[inset_0_-1px_0_var(--color-border)]"
            style={{ top: containerClassName ? 0 : stickyTop }}
          >
            {headerGroups.map((group) => (
              <TableRow key={group.id} className="border-0">
                {group.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const align = meta?.align ?? "left";
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className={cn(align === "right" && "text-right", align === "center" && "text-center", meta?.headerClassName)}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "-mx-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 transition-colors hover:text-foreground focus-visible:outline-2",
                            sorted && "text-foreground"
                          )}
                        >
                          <table.FlexRender header={header} />
                          {sorted === "asc" ? (
                            <ArrowUp aria-hidden className="size-3" />
                          ) : sorted === "desc" ? (
                            <ArrowDown aria-hidden className="size-3" />
                          ) : (
                            <ChevronsUpDown aria-hidden className="size-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading && data.length === 0 ? (
              Array.from({ length: skeletonRows }, (_, index) => (
                <TableRow key={`skeleton-${index}`} aria-hidden className="opacity-40 hover:bg-transparent">
                  {Array.from({ length: columnCount }, (__, cellIndex) => (
                    <TableCell key={cellIndex}>
                      <Skeleton className={cn("h-3.5", cellIndex === 0 ? "w-40" : "w-16")} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnCount} className="h-auto whitespace-normal p-0">
                  {data.length > 0 && filter
                    ? (emptyFiltered ?? (
                        <div className="px-6 py-12 text-center text-sm text-muted-foreground">No results for “{filter}”.</div>
                      ))
                    : (empty ?? <div className="px-6 py-12 text-center text-sm text-muted-foreground">Nothing here yet.</div>)}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const original = row.original;
                const interactive = Boolean(onRowClick);
                return (
                  <TableRow
                    key={row.id}
                    tabIndex={interactive ? 0 : undefined}
                    aria-label={interactive && rowLabel ? rowLabel(original) : undefined}
                    onClick={interactive ? () => onRowClick?.(original) : undefined}
                    onKeyDown={
                      interactive
                        ? (event) => {
                            if (event.target !== event.currentTarget) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onRowClick?.(original);
                            }
                          }
                        : undefined
                    }
                    className={cn(
                      interactive && "cursor-pointer focus-visible:bg-elevated focus-visible:outline-none",
                      rowClassName?.(original)
                    )}
                  >
                    {row.getAllCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      const align = meta?.align ?? "left";
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            align === "right" && "text-right tabular-nums",
                            align === "center" && "text-center",
                            meta?.className
                          )}
                        >
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
