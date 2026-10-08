"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Rows or cards shown before the next page. Short lists stay on one page. */
export const LIST_PAGE_SIZE = 10;

export function usePagedItems<T>(items: T[], resetKey: string, pageSize = LIST_PAGE_SIZE) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;

  return {
    page: current,
    setPage,
    pageCount,
    pageSize,
    total: items.length,
    start,
    items: items.slice(start, start + pageSize),
  };
}

type ListPaginationProps = {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function ListPagination({ page, pageCount, total, pageSize, onPageChange, className }: ListPaginationProps) {
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pages = pageWindow(page, pageCount);

  return (
    <nav aria-label="Pagination" className={cn("flex flex-wrap items-center justify-between gap-3 pt-3", className)}>
      <p className="text-xs text-muted-foreground tabular-nums">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft />
          Previous
        </Button>
        {pages.map((number) => (
          <Button
            key={number}
            type="button"
            variant={number === page ? "default" : "outline"}
            size="sm"
            aria-current={number === page ? "page" : undefined}
            onClick={() => onPageChange(number)}
          >
            {number}
          </Button>
        ))}
        <Button type="button" variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          Next
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}

function pageWindow(page: number, pageCount: number): number[] {
  const width = 5;
  const end = Math.min(pageCount, Math.max(page + 2, width));
  const start = Math.max(1, end - width + 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
