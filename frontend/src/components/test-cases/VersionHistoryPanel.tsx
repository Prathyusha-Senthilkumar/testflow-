"use client";

import { History } from "lucide-react";
import type { TestCaseVersionDetail, TestCaseVersionSummary } from "@/lib/api";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";

type VersionHistoryPanelProps = {
  /** `null` while loading. */
  versions: TestCaseVersionSummary[] | null;
  selected: TestCaseVersionDetail | null;
  onSelect: (versionNumber: number) => void;
};

function Fact({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 break-words text-foreground", mono && "font-mono text-xs")}>{children}</dd>
    </div>
  );
}

/** Published snapshots of a test case (Versions tab). */
export function VersionHistoryPanel({ versions, selected, onSelect }: VersionHistoryPanelProps) {
  if (versions === null) {
    return (
      <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]" aria-busy="true">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  return (
    <>
      {versions.length === 0 ? (
        <EmptyState
          variant="panel"
          icon={History}
          title="No published versions yet"
          description="Publish this test case to create its first snapshot."
          size="sm"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
          <ul className="divide-y divide-border-subtle self-start overflow-hidden rounded-lg border border-border bg-surface">
            {versions.map((version) => {
              const active = selected?.versionNumber === version.versionNumber;
              return (
                <li key={version.versionNumber}>
                  <button
                    type="button"
                    onClick={() => onSelect(version.versionNumber)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "relative w-full px-3 py-2 text-left text-[13px] transition-colors duration-150 hover:bg-state-hover focus-visible:bg-state-hover focus-visible:outline-none",
                      active && "bg-state-active before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
                    )}
                  >
                    <span className="font-medium text-foreground">{version.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">{version.publishedAt}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="min-w-0 rounded-lg border border-border bg-surface p-4 text-[13px]">
            {!selected ? (
              <p className="text-muted-foreground">Select a version to view its snapshot.</p>
            ) : (
              <dl className="space-y-3">
                <Fact label="Name">{selected.name}</Fact>
                <Fact label="Classification">
                  {selected.category} · {selected.scenario}
                </Fact>
                <Fact label="Start path" mono>
                  {selected.startPath}
                </Fact>
                <Fact label="Expected result">{selected.expectedResult || "—"}</Fact>
                <Fact label="Script" mono>
                  {selected.testFile || "—"}
                </Fact>
                {selected.scriptSnapshot ? (
                  <pre className="max-h-56 overflow-auto rounded-md border border-border bg-elevated p-2 font-mono text-xs text-foreground">
                    {selected.scriptSnapshot}
                  </pre>
                ) : null}
              </dl>
            )}
          </div>
        </div>
      )}
    </>
  );
}
