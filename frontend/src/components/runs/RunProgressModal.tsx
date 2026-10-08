import { AttestLoader } from "@/components/brand/attest-loader";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";
import type { BatchCaseOutcome } from "@/lib/api";

export type RunFact = {
  label: string;
  value: string;
};

export type RunCaseRow = {
  id: string;
  code: string;
  name: string;
  outcome: BatchCaseOutcome | "preparing";
  reason?: string | null;
};

type RunProgressModalProps = {
  open: boolean;
  title: string;
  description?: string;
  running: boolean;
  statusLabel: string;
  facts: RunFact[];
  cases?: RunCaseRow[];
  error?: string;
  onClose: () => void;
};

/** Progress dialog shown while a test case / suite run is being started and executed. */
export function RunProgressModal({
  open,
  title,
  description,
  running,
  statusLabel,
  facts,
  cases,
  error,
  onClose,
}: RunProgressModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      panelClassName="sm:max-w-xl"
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2.5 rounded-md border border-border bg-elevated px-3 py-2.5"
      >
        {running ? (
          <AttestLoader size="sm" decorative />
        ) : (
          <span className="size-2 shrink-0 rounded-full bg-faint" aria-hidden />
        )}
        <p className={`text-[13px] font-medium ${running ? "text-info" : "text-foreground"}`}>{statusLabel}</p>
      </div>

      <dl className="mt-4 space-y-2 text-[13px]">
        {facts.map((fact) => (
          <div key={fact.label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{fact.label}</dt>
            <dd className="max-w-[16rem] truncate text-right font-medium text-foreground tabular-nums">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {cases && cases.length > 0 ? (
        <ul className="mt-4 max-h-52 space-y-2 overflow-y-auto border-t border-border pt-4 text-[13px]">
          {cases.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="font-mono text-xs text-muted-foreground">{item.code}</span>{" "}
                <span className="text-foreground">{item.name}</span>
                {item.reason ? <span className="mt-0.5 block text-xs text-muted-foreground">{item.reason}</span> : null}
              </span>
              <RunStatusBadge status={item.outcome} />
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="mt-4 text-[13px] text-destructive">{error}</p> : null}
    </Modal>
  );
}
