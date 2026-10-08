"use client";

import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { delta, formatDuration, type Delta, type KpiSeries, type PeriodMetrics } from "@/lib/dashboard";
import { Stat, StatGroup } from "@/components/common/Stat";
import { Sparkline } from "@/components/charts/sparkline";
import { LoadingArea } from "@/components/common/LoadingArea";

function DeltaLine({ value, format, label }: { value: Delta | null; format: (value: number) => string; label: string }) {
  if (!value) return <span className="text-faint">No data in previous {label}</span>;
  const Icon = value.direction === "up" ? ArrowUpRight : value.direction === "down" ? ArrowDownRight : Minus;
  const tone = value.sentiment === "good" ? "text-brand-accent" : value.sentiment === "bad" ? "text-destructive" : "text-muted-foreground";
  return (
    <span className="inline-flex items-center gap-1">
      {/* Neutral pill; only the arrow and value carry a subtle tone. */}
      <span className={cn("inline-flex h-5 items-center gap-0.5 rounded-sm bg-elevated px-1.5 text-xs font-medium tabular-nums", tone)}>
        <Icon className="size-3" aria-hidden />
        {value.direction === "flat" ? "No change" : format(Math.abs(value.value))}
      </span>
      <span className="text-faint">vs previous {label}</span>
    </span>
  );
}

type KpiStripProps = {
  current: PeriodMetrics | null;
  previous: PeriodMetrics | null;
  series: KpiSeries | null;
  /** "24h" / "7d" / "30d", used in the delta caption. */
  periodLabel: string;
  loading?: boolean;
  /** Clicking "Failing tests" (e.g. scroll to Needs attention). */
  onFailingClick?: () => void;
};

/** Five KPI cells: pass rate, runs, failing tests, median duration, flaky tests. */
export function KpiStrip({ current, previous, series, periodLabel, loading = false, onFailingClick }: KpiStripProps) {
  const show = !loading && current;
  const passRate = current?.passRate ?? null;
  const failing = current?.failingTests ?? 0;

  const failingValue: ReactNode = onFailingClick ? (
    <button
      type="button"
      onClick={onFailingClick}
      className="rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-label={`${failing} failing tests. Show them`}
    >
      {failing}
    </button>
  ) : (
    failing
  );

  const strip = (
    <StatGroup columns={5}>
      <Stat
        size="lg"
        label="Pass rate"
        loading={!show}
        value={passRate == null ? "—" : `${passRate.toFixed(1)}%`}
        hint={show ? <DeltaLine value={delta(passRate, previous?.passRate ?? null, true)} format={(v) => `${v.toFixed(1)} pts`} label={periodLabel} /> : undefined}
        chart={series ? <Sparkline data={series.passRate} color="var(--brand-accent)" label="Pass rate per period" /> : null}
      />
      <Stat
        size="lg"
        label="Runs"
        loading={!show}
        value={current?.runs ?? 0}
        hint={show ? <DeltaLine value={delta(current?.runs ?? null, previous?.runs ?? null, null)} format={(v) => String(Math.round(v))} label={periodLabel} /> : undefined}
        chart={series ? <Sparkline data={series.runs} label="Runs per period" /> : null}
      />
      <Stat
        size="lg"
        label="Failing tests"
        loading={!show}
        tone={failing > 0 ? "destructive" : "default"}
        value={failingValue}
        hint={show ? <DeltaLine value={delta(failing, previous?.failingTests ?? null, false)} format={(v) => String(Math.round(v))} label={periodLabel} /> : undefined}
        chart={series ? <Sparkline data={series.failed} color="var(--destructive)" label="Failed runs per period" /> : null}
      />
      <Stat
        size="lg"
        label="Median duration"
        loading={!show}
        value={formatDuration(current?.medianDurationMs)}
        hint={
          show ? (
            <DeltaLine value={delta(current?.medianDurationMs ?? null, previous?.medianDurationMs ?? null, false)} format={(v) => formatDuration(v)} label={periodLabel} />
          ) : undefined
        }
        chart={series ? <Sparkline data={series.medianDuration} label="Median duration per period" /> : null}
      />
      <Stat
        size="lg"
        label="Flaky tests"
        loading={!show}
        value={current?.flakyTests ?? 0}
        hint={show ? <DeltaLine value={delta(current?.flakyTests ?? null, previous?.flakyTests ?? null, false)} format={(v) => String(Math.round(v))} label={periodLabel} /> : undefined}
      />
    </StatGroup>
  );

  // First load: faint tiles with a centred loader; refreshes keep the numbers visible.
  return loading && !current ? <LoadingArea loading label="Loading metrics…" skeleton={strip} /> : strip;
}
