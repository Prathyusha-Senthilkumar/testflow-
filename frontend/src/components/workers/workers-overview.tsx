"use client";

import type { WorkersResponse } from "@/lib/api";
import { SectionHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingArea } from "@/components/common/LoadingArea";
import { WorkersKpis } from "@/components/workers/workers-kpis";
import { WorkerCard } from "@/components/workers/worker-card";
import { RunningNowTable } from "@/components/workers/running-now";
import { QueuePanel } from "@/components/workers/queue-panel";
import { WorkersEmpty } from "@/components/workers/workers-empty";
import { useNow } from "@/components/workers/use-now";

export type WorkersOverviewProps = {
  /** Latest payload; null before the first response. */
  data: WorkersResponse | null;
  /** First load in progress (nothing to lay out yet). */
  loading?: boolean;
  /** The endpoint doesn't exist (old backend): show the empty/old-build state. */
  unavailable?: boolean;
  /** Non-404 error from the latest poll; last data stays visible. */
  error?: string | null;
  projectNames?: Record<string, string>;
};

/** Presentational Workers page body (KPIs, worker cards, running now, queue). */
export function WorkersOverview({ data, loading = false, unavailable = false, error = null, projectNames = {} }: WorkersOverviewProps) {
  const now = useNow(5000);

  if (loading && !data) {
    return (
      <LoadingArea
        loading
        label="Loading runners…"
        skeleton={
          <div className="space-y-6">
            <WorkersKpis data={null} loading />
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-56 w-full" />
              <Skeleton className="h-56 w-full" />
            </div>
          </div>
        }
      />
    );
  }

  if (unavailable || (data && data.workers.length === 0)) {
    return (
      <div className="space-y-6">
        {error ? <Alert variant="error" title="Couldn’t refresh runner status">{error}</Alert> : null}
        {data ? <WorkersKpis data={data} /> : null}
        <WorkersEmpty message={data?.message} unavailable={unavailable && !data} />
        {/* Old worker builds still report real queue counts: show them. */}
        {data ? (
          <section className="max-w-md space-y-3">
            <SectionHeader title="Queue" />
            <QueuePanel queue={data.queue} />
          </section>
        ) : null}
      </div>
    );
  }

  if (!data) {
    return <Alert variant="error" title="Couldn’t load runner status">{error ?? "Please try again in a moment."}</Alert>;
  }

  return (
    <div className="space-y-6">
      {error ? <Alert variant="error" title="Couldn’t refresh runner status">{error} Showing the last known state.</Alert> : null}
      {data.message ? <Alert variant="info">{data.message}</Alert> : null}
      <WorkersKpis data={data} />

      {/* No "Runners" section header: it would repeat the page title, and the count is in the KPI strip. */}
      <section>
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {data.workers.map((worker) => (
            <WorkerCard key={worker.id} worker={worker} projectNames={projectNames} now={now} />
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 space-y-3">
          <SectionHeader title="Running now" />
          <RunningNowTable workers={data.workers} projectNames={projectNames} />
        </section>
        <section className="space-y-3">
          <SectionHeader title="Queue" />
          <QueuePanel queue={data.queue} />
        </section>
      </div>
    </div>
  );
}
