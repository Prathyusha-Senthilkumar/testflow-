"use client";

import { Cookie, Plus, X } from "lucide-react";
import { STORAGE_KINDS, type StorageEntry, type StorageKind } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { storageKindLabel } from "@/components/test-cases/testCaseFormat";

type StorageMode = "seed" | "assert";

type StoragePanelProps = {
  mode: StorageMode;
  onModeChange: (mode: StorageMode) => void;
  kind: StorageKind;
  onKindChange: (kind: StorageKind) => void;
  entryKey: string;
  onEntryKeyChange: (value: string) => void;
  entryValue: string;
  onEntryValueChange: (value: string) => void;
  onAdd: () => void;
  /** Inline validation message for the key field. */
  validationError?: string;
  seeds: StorageEntry[];
  assertions: StorageEntry[];
  onRemove: (mode: StorageMode, index: number) => void;
};

const MODES: { value: StorageMode; label: string }[] = [
  { value: "seed", label: "Seed" },
  { value: "assert", label: "Assert" },
];

/** Storage and cookie values seeded before the run or asserted after it. */
export function StoragePanel({
  mode,
  onModeChange,
  kind,
  onKindChange,
  entryKey,
  onEntryKeyChange,
  entryValue,
  onEntryValueChange,
  onAdd,
  validationError,
  seeds,
  assertions,
  onRemove,
}: StoragePanelProps) {
  const entries = [
    ...seeds.map((entry, index) => ({ entry, index, mode: "seed" as const })),
    ...assertions.map((entry, index) => ({ entry, index, mode: "assert" as const })),
  ];

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Cookie className="size-4 text-muted-foreground" aria-hidden />
            Storage &amp; cookies
          </CardTitle>
          <CardDescription>
            {mode === "seed"
              ? "Seeded values are applied before the test actions run."
              : "Asserted values are checked after the test actions finish."}
          </CardDescription>
        </div>
        <div role="radiogroup" aria-label="Storage mode" className="inline-flex rounded-md border border-border bg-elevated p-0.5">
          {MODES.map((item) => {
            const active = mode === item.value;
            return (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onModeChange(item.value)}
                className={cn(
                  "h-7 rounded-[5px] px-3 text-[13px] font-medium transition-colors duration-150",
                  active
                    ? "bg-surface text-foreground shadow-[0_0_0_1px_var(--color-border)]"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="grid gap-2 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start"
          onSubmit={(event) => {
            event.preventDefault();
            onAdd();
          }}
        >
          <Select
            aria-label="Storage type"
            value={kind}
            onChange={(value) => onKindChange(value as StorageKind)}
            options={STORAGE_KINDS.map((item) => ({ value: item, label: storageKindLabel(item) }))}
          />
          <Input
            aria-label={kind === "cookie" ? "Cookie name" : "Storage key"}
            className="font-mono"
            value={entryKey}
            onChange={(event) => onEntryKeyChange(event.target.value)}
            placeholder={kind === "cookie" ? "cookie name" : "key"}
            error={validationError}
          />
          <Input
            aria-label="Value"
            className="font-mono"
            value={entryValue}
            onChange={(event) => onEntryValueChange(event.target.value)}
            placeholder="value"
          />
          <Button type="submit" variant="secondary">
            <Plus aria-hidden />
            Add
          </Button>
        </form>

        {entries.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No storage or cookie values configured.</p>
        ) : (
          <ul className="divide-y divide-border-subtle overflow-hidden rounded-md border border-border">
            {entries.map(({ entry, index, mode: entryMode }) => (
              <li key={`${entryMode}-${entry.kind}-${entry.key}-${index}`} className="flex items-center gap-2.5 px-3 py-1.5 text-[13px]">
                <Badge variant={entryMode === "seed" ? "primary" : "outline"}>{entryMode === "seed" ? "Seed" : "Assert"}</Badge>
                <span className="shrink-0 text-xs text-muted-foreground">{storageKindLabel(entry.kind)}</span>
                <span className="min-w-0 truncate font-mono text-xs">{entry.key}</span>
                <span className="text-faint">=</span>
                <span className="min-w-0 truncate font-mono text-xs">{entry.value || '""'}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onRemove(entryMode, index)}
                  className="ml-auto size-7 hover:text-destructive"
                  aria-label={`Remove ${entry.key}`}
                >
                  <X aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
