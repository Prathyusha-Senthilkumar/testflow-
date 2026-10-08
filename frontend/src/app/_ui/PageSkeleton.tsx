import { Skeleton } from "@/components/ui/skeleton";
import { AttestLoaderIntro } from "@/components/brand/attest-loader";

/**
 * Route-level loading fallback used by `loading.tsx` files.
 *
 * Server component with no client JS, so Next.js can prefetch an instant
 * loading state for dynamic routes. Mirrors PageContainer + PageHeader +
 * a stat row + a table so content swaps in without layout shift.
 */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="relative flex flex-col gap-6 p-4 sm:p-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <AttestLoaderIntro />
      <div className="space-y-2" aria-hidden="true">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-lg border border-border bg-surface lg:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-2 p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-12" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-surface" aria-hidden="true">
        <div className="h-9 border-b border-border" />
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex h-11 items-center gap-4 border-b border-border-subtle px-3 last:border-b-0">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3.5 w-1/5" />
            <Skeleton className="ml-auto h-3.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
