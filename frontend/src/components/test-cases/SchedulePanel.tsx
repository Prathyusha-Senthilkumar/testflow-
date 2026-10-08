"use client";

import { CalendarClock, X } from "lucide-react";
import type { ScheduledExecution, TestRunHistoryItem } from "@/lib/api";
import { formatInTimeZone } from "@/lib/scheduleTime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";

type SchedulePanelProps = {
  date: string;
  time: string;
  zone: string;
  detectedZone: string;
  zoneOverridden: boolean;
  timeZones: string[];
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  /** Called when the user explicitly picks a timezone. */
  onZoneChange: (value: string) => void;
  onSchedule: () => void;
  canSchedule: boolean;
  scheduling: boolean;
  /** Inline validation message for the date/time/zone fields. */
  validationError?: string;
  scheduled: ScheduledExecution[];
  scheduledResults: TestRunHistoryItem[];
  onCancel: (jobId: string) => void;
};

/** "Run later": one-off scheduling plus upcoming jobs and finished scheduled runs. */
export function SchedulePanel({
  date,
  time,
  zone,
  detectedZone,
  zoneOverridden,
  timeZones,
  onDateChange,
  onTimeChange,
  onZoneChange,
  onSchedule,
  canSchedule,
  scheduling,
  validationError,
  scheduled,
  scheduledResults,
  onCancel,
}: SchedulePanelProps) {
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
            Schedule
          </CardTitle>
          <CardDescription>Run this test once at a future date and time.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,150px)_minmax(0,120px)_minmax(0,1fr)_auto] sm:items-start">
          <Input
            type="date"
            aria-label="Schedule date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
            className="tabular-nums"
          />
          <Input
            type="time"
            aria-label="Schedule time"
            value={time}
            onChange={(event) => onTimeChange(event.target.value)}
            className="tabular-nums"
          />
          <Select
            aria-label="Schedule timezone"
            value={zone}
            onChange={onZoneChange}
            options={timeZones.map((item) => ({ value: item, label: item }))}
          />
          <Button type="button" variant="secondary" onClick={onSchedule} disabled={!canSchedule || scheduling} loading={scheduling}>
            {scheduling ? "Scheduling…" : "Run later"}
          </Button>
        </div>
        {validationError ? (
          <p role="alert" className="text-xs text-destructive">
            {validationError}
          </p>
        ) : !zoneOverridden && zone === detectedZone ? (
          <p className="text-xs text-muted-foreground">Timezone detected from your device.</p>
        ) : null}

        {scheduled.length > 0 || scheduledResults.length > 0 ? (
          <ul className="divide-y divide-border-subtle overflow-hidden rounded-md border border-border">
            {scheduled.map((item) => (
              <li key={item.jobId} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
                <RunStatusBadge status="scheduled" />
                <span className="min-w-0 truncate tabular-nums">
                  {item.scheduledFor ? formatInTimeZone(item.scheduledFor, item.timeZone || zone) : "Pending"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onCancel(item.jobId)}
                  className="ml-auto h-7 hover:text-destructive"
                >
                  <X aria-hidden />
                  Cancel
                </Button>
              </li>
            ))}
            {scheduledResults.map((run) => (
              <li key={run.id} className="px-3 py-2 text-[13px]">
                <div className="flex flex-wrap items-center gap-2.5">
                  <RunStatusBadge status={run.status} />
                  <span className="text-muted-foreground">
                    Scheduled for{" "}
                    <span className="text-foreground tabular-nums">
                      {formatInTimeZone(run.scheduledFor || "", run.timeZone || zone)}
                    </span>
                  </span>
                  {run.durationMs != null && run.status !== "Running" ? (
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {(run.durationMs / 1000).toFixed(1)}s
                    </span>
                  ) : null}
                </div>
                {run.errorMessage ? (
                  <pre className="mt-2 max-h-24 overflow-auto rounded-md bg-destructive-soft p-2 font-mono text-[11px] whitespace-pre-wrap text-destructive">
                    {run.errorMessage}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
