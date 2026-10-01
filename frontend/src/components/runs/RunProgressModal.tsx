import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
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

const outcomeClass: Record<RunCaseRow["outcome"], string> = {
  preparing: "text-slate-500",
  queued: "text-slate-500",
  running: "text-indigo-700",
  passed: "text-teal-700",
  failed: "text-red-600",
  skipped: "text-amber-700",
  cancelled: "text-orange-700",
};

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
      panelClassName="max-w-xl"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-700"
        >
          Close
        </button>
      }
    >
      <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
        {running ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-indigo-600" aria-hidden />
        ) : (
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-400" aria-hidden />
        )}
        <p className={`text-sm font-medium ${running ? "text-indigo-700" : "text-slate-800"}`}>
          {statusLabel}
        </p>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        {facts.map((fact) => (
          <div key={fact.label} className="flex justify-between gap-4">
            <dt className="text-slate-500">{fact.label}</dt>
            <dd className="max-w-[16rem] truncate text-right font-medium text-slate-900">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {cases && cases.length > 0 ? (
        <ul className="mt-4 max-h-52 space-y-2 overflow-y-auto border-t border-slate-100 pt-4 text-sm">
          {cases.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="font-mono text-xs text-slate-500">{item.code}</span>{" "}
                <span className="text-slate-800">{item.name}</span>
                {item.reason ? <span className="mt-0.5 block text-xs text-slate-500">{item.reason}</span> : null}
              </span>
              <span className={`shrink-0 font-medium capitalize ${outcomeClass[item.outcome]}`}>
                {item.outcome}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
    </Modal>
  );
}
