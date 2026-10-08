"use client";

import { ChevronRight } from "lucide-react";
import { operatorDetail } from "@/lib/friendlyErrors";
import { cn } from "@/lib/utils";

/**
 * Collapsed "Details for administrators" disclosure. Pass `detail` directly,
 * or `message` to look up the operator text behind a friendly error.
 */
export function AdminDetails({ detail, message, className }: { detail?: string | null; message?: string | null; className?: string }) {
  const text = detail ?? operatorDetail(message);
  if (!text) return null;
  return (
    <details className={cn("group mt-2 text-xs text-muted-foreground", className)}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3 transition-transform group-open:rotate-90" aria-hidden />
        Details for administrators
      </summary>
      <pre className="mt-1.5 max-h-40 overflow-auto rounded-sm border border-border bg-elevated p-2 font-mono text-[11px] whitespace-pre-wrap break-words">{text}</pre>
    </details>
  );
}
