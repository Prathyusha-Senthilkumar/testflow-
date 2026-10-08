import { ArrowRight } from "lucide-react";
import type { WorkersResponse } from "@/lib/api";
import { Link } from "@/lib/navigation";
import { Card, CardContent } from "@/components/ui/card";

/** Queue depth: queued, processing, pending batches; scheduled runs live on Test Runs › Scheduled. */
export function QueuePanel({ queue }: { queue: WorkersResponse["queue"] }) {
  const rows: [string, number | null | undefined][] = queue
    ? [
        ["Queued", queue.queued],
        ["Processing", queue.processing],
        // null when the batches migration isn't applied: show "—".
        ["Batches pending", queue.batchesPending],
      ]
    : [];
  return (
    <Card>
      <CardContent>
        {queue ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-xl font-semibold tabular-nums">{value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-[13px] text-muted-foreground">Queue status is unavailable.</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link to="/runs" className="inline-flex items-center gap-1 text-[13px] text-brand-accent hover:text-foreground hover:underline">
            View test runs <ArrowRight className="size-3.5" aria-hidden />
          </Link>
          <Link to="/runs?tab=scheduled" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground hover:underline">
            Scheduled runs{queue?.scheduled ? ` (${queue.scheduled})` : ""} <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
