"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Code2, FileCode2, ListChecks, Mic, Plus, RotateCcw, X } from "lucide-react";
import type { AssertionConfig, AssertionType, AuthProfileSummary, StorageEntry, TestCaseSummary } from "@/lib/api";
import { friendlyStepLabel } from "@/lib/stepLabel";
import { cn } from "@/lib/utils";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { AttestLoader } from "@/components/brand/attest-loader";
import { ScriptTab } from "@/components/test-cases/ScriptTab";
import {
  MASKED_VALUE,
  authProfileLabel,
  isSecretField,
  parseScriptSteps,
  storageKindLabel,
  type ScriptStep,
} from "@/components/test-cases/testCaseFormat";

type StepRow = {
  key: string;
  verb: string;
  /** Human sentence (from stepLabel for recorded steps). */
  label: string;
  target?: string;
  value?: string;
  secret?: boolean;
  onRemove?: () => void;
};

const ASSERTION_LABELS: Record<AssertionType, string> = {
  url_contains: "URL contains",
  text_visible: "Text visible",
  page_title_contains: "Title contains",
};

function maskLabel(label: string, value?: string) {
  return value ? label.split(value).join(MASKED_VALUE) : label;
}

function scriptRow(step: ScriptStep): StepRow {
  const secret = isSecretField(step.target, step.raw);
  const friendly = friendlyStepLabel(step.raw);
  return {
    key: `line-${step.line}`,
    verb: step.verb,
    label: secret ? maskLabel(friendly, step.value) : friendly,
    target: step.target,
    value: step.value,
    secret,
  };
}

function StepList({ rows, start }: { rows: StepRow[]; start: number }) {
  return (
    <ol className="divide-y divide-border-subtle">
      {rows.map((row, index) => (
        <li key={row.key} className="group flex items-start gap-3 py-2 text-[13px]">
          <span className="mt-0.5 w-5 shrink-0 text-right text-xs text-faint tabular-nums">{start + index}</span>
          <Badge variant="outline" className="mt-px shrink-0">
            {row.verb}
          </Badge>
          <span className="min-w-0 flex-1">
            <span className="block text-foreground">{row.label}</span>
            {row.target && row.target !== row.label ? (
              <code className="mt-0.5 block truncate font-mono text-xs text-muted-foreground" title={row.target}>
                {row.target}
              </code>
            ) : null}
            {row.value ? (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground" title={row.secret ? undefined : row.value}>
                Value: {row.secret ? MASKED_VALUE : `“${row.value}”`}
              </span>
            ) : null}
          </span>
          {row.onRemove ? (
            <Button variant="ghost" size="icon-sm" className="reveal-on-hover size-7" aria-label={`Remove ${row.label}`} onClick={row.onRemove}>
              <X />
            </Button>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function Phase({ label, hint, children, actions }: { label: string; hint: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="px-4 py-3">
      <header className="mb-1 flex items-center gap-2">
        <h3 className="text-xs font-semibold tracking-[0.06em] text-foreground uppercase">{label}</h3>
        <p className="flex-1 text-xs text-muted-foreground">{hint}</p>
        {actions}
      </header>
      {children}
    </section>
  );
}

function AddAssertionRow({ onAdd, onCancel }: { onAdd: (type: AssertionType, value: string) => void; onCancel: () => void }) {
  const [type, setType] = useState<AssertionType>("text_visible");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className="mt-2 flex flex-wrap items-start gap-2 rounded-md border border-dashed border-border p-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!value.trim()) {
          setError("Enter the expected value");
          return;
        }
        onAdd(type, value.trim());
      }}
    >
      <Select
        aria-label="Assertion type"
        size="sm"
        className="w-40"
        value={type}
        onChange={(next) => setType(next as AssertionType)}
        options={(Object.keys(ASSERTION_LABELS) as AssertionType[]).map((key) => ({ value: key, label: ASSERTION_LABELS[key] }))}
      />
      <div className="min-w-48 flex-1">
        <Input
          aria-label="Expected value"
          className="h-8"
          autoFocus
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError("");
          }}
          placeholder={type === "url_contains" ? "/dashboard" : type === "page_title_contains" ? "Dashboard" : "Welcome back"}
          error={error}
        />
      </div>
      <Button type="submit" size="sm">
        Add
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

export type StepsTabProps = {
  testCase: TestCaseSummary;
  /** Script source; `null` while loading, "" when there is none. */
  script: string | null;
  scriptPath: string;
  startUrl: string;
  authProfile?: AuthProfileSummary;
  storageSeeds: StorageEntry[];
  storageAssertions: StorageEntry[];
  assertions: AssertionConfig[];
  onAddAssertion: (type: AssertionType, value: string) => void;
  onRemoveAssertion: (id: string) => void;
  expectedResult: string;
  onExpectedResultChange: (value: string) => void;
  editing: boolean;
  recording: boolean;
  canRecord: boolean;
  onRecord: () => void;
  onEditCode: () => void;
  scriptMissing: boolean;
  /** Storage editor shown under the steps in edit mode. */
  storageEditor?: ReactNode;
};

/** The single authoring place: Arrange / Act / Assert, recording, code view and assertions. */
export function StepsTab({
  testCase,
  script,
  scriptPath,
  startUrl,
  authProfile,
  storageSeeds,
  storageAssertions,
  assertions,
  onAddAssertion,
  onRemoveAssertion,
  expectedResult,
  onExpectedResultChange,
  editing,
  recording,
  canRecord,
  onRecord,
  onEditCode,
  scriptMissing,
  storageEditor,
}: StepsTabProps) {
  const [showCode, setShowCode] = useState(false);
  const [addingAssertion, setAddingAssertion] = useState(false);
  const outline = useMemo(() => (script ? parseScriptSteps(script) : { act: [], assert: [] }), [script]);
  const hasSteps = outline.act.length > 0 || Boolean(script?.trim());

  const arrange: StepRow[] = [
    { key: "open", verb: "Open", label: `Open ${startUrl || testCase.startPath || "/"}` },
    ...(authProfile ? [{ key: "auth", verb: "Sign in", label: `Sign in as ${authProfileLabel(authProfile)}` }] : []),
    ...storageSeeds.map((entry, index) => ({
      key: `seed-${index}`,
      verb: "Seed",
      label: `Set ${storageKindLabel(entry.kind)} “${entry.key}”`,
      value: entry.value,
      secret: isSecretField(entry.key),
    })),
  ];
  const act = outline.act.map(scriptRow);
  const asserts: StepRow[] = [
    ...outline.assert.map(scriptRow),
    ...assertions
      .filter((item) => item.value?.trim())
      .map((item) => ({
        key: `assertion-${item.id}`,
        verb: "Expect",
        label: `${ASSERTION_LABELS[item.type] ?? "Check"} “${item.value}”`,
        onRemove: () => onRemoveAssertion(item.id),
      })),
    ...storageAssertions.map((entry, index) => ({
      key: `expect-${index}`,
      verb: "Expect",
      label: `${storageKindLabel(entry.kind)} “${entry.key}” equals`,
      value: entry.value,
      secret: isSecretField(entry.key),
    })),
  ];

  const recordButton = hasSteps ? (
    <Button variant="outline" size="sm" onClick={onRecord} disabled={!canRecord} loading={recording}>
      {!recording ? <RotateCcw /> : null}
      Re-record
    </Button>
  ) : (
    <Button size="sm" onClick={onRecord} disabled={!canRecord} loading={recording}>
      {!recording ? <Mic /> : null}
      Record
    </Button>
  );

  return (
    <div className="space-y-4">
      {recording ? (
        <div role="status" className="flex items-center gap-2.5 rounded-md border border-primary/40 bg-state-active px-3 py-2 text-[13px] text-foreground">
          <AttestLoader size="sm" decorative />
          Recording in your browser… close the recorder window when you’re done. Steps update automatically.
        </div>
      ) : null}
      {scriptMissing ? (
        <Alert variant="warning" title="Recorded steps are missing">
          This test’s recording is no longer available, so it can’t run. Record it again, or use View code → Edit code to restore it.
        </Alert>
      ) : null}

      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Steps</CardTitle>
          </div>
          <CardAction>
            {script?.trim() ? (
              <Button variant="ghost" size="sm" onClick={() => setShowCode((value) => !value)} aria-pressed={showCode}>
                {showCode ? <ListChecks /> : <Code2 />}
                {showCode ? "View steps" : "View code"}
              </Button>
            ) : null}
            {recordButton}
          </CardAction>
        </CardHeader>
        <div className="divide-y divide-border">
          <Phase label="Arrange" hint="Starting state">
            <StepList rows={arrange} start={1} />
          </Phase>
          <Phase label="Act" hint="What the test does">
            {showCode ? (
              <div className="py-2">
                <ScriptTab content={script} path={scriptPath} onEdit={onEditCode} onRecord={onRecord} recording={recording} canRecord={canRecord} />
              </div>
            ) : script === null ? (
              <div className="space-y-2 py-2" aria-busy="true">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-3/5" />
              </div>
            ) : act.length > 0 ? (
              <StepList rows={act} start={arrange.length + 1} />
            ) : (
              <div className="my-2 flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-8 text-center">
                <span className="grid size-10 place-items-center rounded-md border border-border bg-elevated text-muted-foreground">
                  <FileCode2 className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{script ? "No readable steps in this recording" : "Record now"}</p>
                  <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
                    {script
                      ? "Use View code to see what was recorded."
                      : "Click Record, perform the flow in the browser window that opens, then close it. Attest turns your actions into steps."}
                  </p>
                </div>
                {!script ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={onRecord} disabled={!canRecord} loading={recording}>
                      {!recording ? <Mic /> : null}
                      Record in browser
                    </Button>
                    <Button variant="outline" onClick={onEditCode} disabled={recording}>
                      <Code2 />
                      Write steps
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </Phase>
          <Phase
            label="Assert"
            hint="What must be true"
            actions={
              !addingAssertion ? (
                <Button variant="ghost" size="sm" className="h-7" onClick={() => setAddingAssertion(true)}>
                  <Plus /> Add assertion
                </Button>
              ) : null
            }
          >
            {asserts.length > 0 ? <StepList rows={asserts} start={arrange.length + act.length + 1} /> : null}
            {addingAssertion ? (
              <AddAssertionRow
                onCancel={() => setAddingAssertion(false)}
                onAdd={(type, value) => {
                  onAddAssertion(type, value);
                  setAddingAssertion(false);
                }}
              />
            ) : null}
            {editing ? (
              <div className={cn(asserts.length > 0 && "mt-2 border-t border-border-subtle pt-3")}>
                <Input
                  label="Expected result"
                  value={expectedResult}
                  onChange={(event) => onExpectedResultChange(event.target.value)}
                  placeholder="Welcome to Dashboard"
                  hint="Optional. When set, a run checks that this text is visible after the steps."
                />
              </div>
            ) : expectedResult.trim() ? (
              <p className={cn("text-[13px] text-foreground", asserts.length > 0 && "mt-2 border-t border-border-subtle pt-2")}>
                <span className="text-muted-foreground">Expected result: </span>
                {expectedResult}
              </p>
            ) : asserts.length === 0 && !addingAssertion ? (
              <p className="py-2 text-[13px] text-muted-foreground">No assertions yet.</p>
            ) : null}
          </Phase>
        </div>
      </Card>

      {editing && storageEditor ? storageEditor : null}
    </div>
  );
}
