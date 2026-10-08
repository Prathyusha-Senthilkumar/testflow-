import { Clock } from "lucide-react";
import { normalizeStatus } from "@/components/runs/RunStatusBadge";

const LONG_WAIT_MS = 10 * 60 * 1000;

/** True when a run has been queued for more than 10 minutes. */
export function isLongQueued(status: string | null | undefined, since: string | null | undefined, now = Date.now()): boolean {
  if (normalizeStatus(status) !== "queued" || !since) return false;
  const started = new Date(since).getTime();
  return Number.isFinite(started) && now - started > LONG_WAIT_MS;
}

/** Muted "Waiting a long time" hint shown next to a status badge for long-queued runs. */
export function WaitingHint({ status, since }: { status: string | null | undefined; since: string | null | undefined }) {
  // eslint-disable-next-line react-hooks/purity -- a coarse "now" is fine for a 10-minute threshold
  if (!isLongQueued(status, since, Date.now())) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground" title="This run has been queued for more than 10 minutes.">
      <Clock className="size-3" aria-hidden /> Waiting a long time
    </span>
  );
}
