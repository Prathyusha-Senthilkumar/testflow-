import { FileCheck2, FolderKanban, History, Layers, type LucideIcon } from "lucide-react";
import type { SearchResultType } from "@/lib/api";
import { highlightSegments } from "@/lib/search";
import { cn } from "@/lib/utils";

export const SEARCH_TYPE_ICONS: Record<SearchResultType, LucideIcon> = {
  project: FolderKanban,
  suite: Layers,
  test_case: FileCheck2,
  run: History,
};

/** Text with the matched query wrapped in a subtle brand-accent <mark>. */
export function Highlight({ text, query, className }: { text: string; query: string; className?: string }) {
  return (
    <span className={className}>
      {highlightSegments(text, query).map((segment, index) =>
        segment.match ? (
          <mark key={index} className="rounded-[2px] bg-brand-accent/25 px-px text-inherit">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </span>
  );
}

/** Small square icon tile for a result type. */
export function SearchTypeIcon({ type, className }: { type: SearchResultType; className?: string }) {
  const Icon = SEARCH_TYPE_ICONS[type];
  return (
    <span className={cn("grid size-7 shrink-0 place-items-center rounded-md border border-border bg-elevated text-muted-foreground", className)}>
      <Icon className="size-3.5" aria-hidden />
    </span>
  );
}
