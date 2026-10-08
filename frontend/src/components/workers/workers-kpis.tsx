import type { WorkersResponse } from "@/lib/api";
import { isSaturated, ratio, warmSlots } from "@/lib/workers";
import { Stat, StatGroup } from "@/components/common/Stat";
import { Badge } from "@/components/ui/badge";

function SlotMeter({ busy, total }: { busy: number; total: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated" aria-hidden>
      <div className="h-full rounded-full bg-primary" style={{ width: `${ratio(busy, total) * 100}%` }} />
    </div>
  );
}

/** KPI strip for the Workers page. Warning tone when work is queued and no slot is idle. */
export function WorkersKpis({ data, loading = false }: { data: WorkersResponse | null; loading?: boolean }) {
  const totals = data?.totals;
  const queue = data?.queue ?? null;
  const saturated = data ? isSaturated(data) : false;
  const warm = data ? warmSlots(data.workers) : null;
  const running = totals?.busy ?? 0;

  return (
    <StatGroup columns={6}>
      <Stat label="Runners online" loading={loading} value={totals ? `${totals.online} of ${totals.workers}` : "—"} hint={totals && totals.stale > 0 ? `${totals.stale} not responding` : undefined} tone={totals && totals.stale > 0 ? "warning" : "default"} />
      <Stat
        label="Slots busy"
        loading={loading}
        tone={saturated ? "warning" : "default"}
        value={totals ? `${totals.busy} / ${totals.slots}` : "—"}
        hint={totals ? <SlotMeter busy={totals.busy} total={totals.slots} /> : undefined}
      />
      <Stat
        label="Idle slots"
        loading={loading}
        tone={saturated ? "warning" : "default"}
        value={totals ? totals.idle : "—"}
        hint={saturated ? <Badge variant="warning">Saturated</Badge> : undefined}
      />
      <Stat label="Warm slots" loading={loading} value={warm == null ? "—" : warm} hint={warm == null ? "Not reported" : "Ready to start instantly"} />
      <Stat label="Queued" loading={loading} tone={saturated ? "warning" : "default"} value={queue ? queue.queued : "—"} hint={queue ? `${queue.scheduled} scheduled` : "Queue unavailable"} />
      <Stat label="Running now" loading={loading} value={totals ? running : "—"} hint={queue ? `${queue.processing} processing` : undefined} />
    </StatGroup>
  );
}
