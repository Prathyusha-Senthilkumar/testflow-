"use client";

import { Link } from "@/lib/navigation";
import { formatDuration, type TestStat } from "@/lib/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { Meter, OutcomeTicks } from "@/components/dashboard/panel";

function testHref(stat: TestStat): string | null {
  if (stat.projectId && stat.testCaseId) return `/projects/${stat.projectId}/test-cases/${stat.testCaseId}`;
  if (stat.projectId) return `/projects/${stat.projectId}/results/${stat.latestRunId}`;
  return null;
}

function Rows({ loading, empty, children }: { loading: boolean; empty: boolean; children: React.ReactNode }) {
  if (loading) {
    return (
      <ul className="divide-y divide-border-subtle" aria-busy="true">
        {Array.from({ length: 5 }, (_, index) => (
          <li key={index} className="flex items-center gap-3 px-3 py-2.5">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="ml-auto h-1.5 w-24" />
          </li>
        ))}
      </ul>
    );
  }
  if (empty) return <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">Not enough runs in this range.</p>;
  return <ul className="divide-y divide-border-subtle">{children}</ul>;
}

function TestLabel({ stat }: { stat: TestStat }) {
  const href = testHref(stat);
  const label = (
    <>
      {stat.code ? <span className="mr-1.5 font-mono text-xs text-muted-foreground">{stat.code}</span> : null}
      <span className="text-foreground">{stat.name}</span>
    </>
  );
  return (
    <span className="min-w-0 flex-1 truncate text-[13px]" title={stat.name}>
      {href ? (
        <Link to={href} className="hover:underline">
          {label}
        </Link>
      ) : (
        label
      )}
      {stat.projectName ? <span className="block truncate text-xs text-muted-foreground">{stat.projectName}</span> : null}
    </span>
  );
}

/** Top tests by median duration, with a relative duration bar. */
export function SlowestTestsList({ items, loading = false }: { items: TestStat[]; loading?: boolean }) {
  const max = Math.max(1, ...items.map((item) => item.medianDurationMs ?? 0));
  return (
    <Rows loading={loading} empty={items.length === 0}>
      {items.map((item) => (
        <li key={item.testKey} className="flex items-center gap-3 px-3 py-2 transition-colors duration-150 hover:bg-state-hover">
          <TestLabel stat={item} />
          <span className="flex w-36 shrink-0 items-center gap-2">
            <Meter value={((item.medianDurationMs ?? 0) / max) * 100} tone="brand" label={`${item.name} median duration`} />
            <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{formatDuration(item.medianDurationMs)}</span>
          </span>
        </li>
      ))}
    </Rows>
  );
}

/** Top tests by Passed↔Failed flips, with their result strip. */
export function FlakiestTestsList({ items, loading = false }: { items: TestStat[]; loading?: boolean }) {
  return (
    <Rows loading={loading} empty={items.length === 0}>
      {items.map((item) => (
        <li key={item.testKey} className="flex items-center gap-3 px-3 py-2 transition-colors duration-150 hover:bg-state-hover">
          <TestLabel stat={item} />
          <OutcomeTicks outcomes={item.outcomes} />
          <span className="w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
            {item.flips} {item.flips === 1 ? "flip" : "flips"}
          </span>
        </li>
      ))}
    </Rows>
  );
}
