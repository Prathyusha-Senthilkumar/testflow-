"use client";

import { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import type { EnvironmentSummary } from "@/lib/api";
import { browserTimeZone, supportedTimeZones, zonedWallTimeToUtc } from "@/lib/scheduleTime";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select, type SelectOption } from "@/components/ui/select";

export type ScheduleRunInput = {
  /** UTC instant, ISO 8601. */
  runAt: string;
  /** IANA timezone the tester picked. */
  timeZone: string;
  environmentId: string;
  /** Only when `categoryOptions` is given. "" means all. */
  category?: string;
};

export type ScheduleRunDialogProps = {
  open: boolean;
  onClose: () => void;
  /** e.g. "Schedule suite run". */
  title: string;
  /** What will run, e.g. the suite name. */
  description?: string;
  environments: EnvironmentSummary[];
  /** Default environment (the one Run uses); falls back to the first. The select shows only with 2+ environments. */
  environmentId?: string;
  /** Optional filter (project runs): first option is the default unless `category` is set. */
  categoryOptions?: SelectOption[];
  category?: string;
  /** Resolve to close. Throw to keep the dialog open and show the message inline. */
  onSubmit: (input: ScheduleRunInput) => Promise<void>;
};

/** "Schedule run…" from a Run menu: date, time, timezone, plus environment (only when there is a choice) and category (projects). */
export function ScheduleRunDialog(props: ScheduleRunDialogProps) {
  // Mount the form only while open so every opening starts from fresh defaults.
  return props.open ? <ScheduleRunForm {...props} /> : null;
}

function defaultSlot(timeZone: string): { date: string; time: string } {
  // Next full hour in the chosen zone, at least 5 minutes away.
  const target = new Date(Date.now() + 5 * 60_000);
  target.setMinutes(60, 0, 0);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(target);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}` };
}

function ScheduleRunForm({
  onClose,
  title,
  description,
  environments,
  environmentId,
  categoryOptions,
  category,
  onSubmit,
}: ScheduleRunDialogProps) {
  const timeZones = useMemo(() => supportedTimeZones(), []);
  const [zone, setZone] = useState(() => browserTimeZone());
  const [slot] = useState(() => defaultSlot(zone));
  const [date, setDate] = useState(slot.date);
  const [time, setTime] = useState(slot.time);
  const [envId, setEnvId] = useState(
    () => environments.find((env) => env.id === environmentId)?.id ?? environments[0]?.id ?? ""
  );
  const [categoryValue, setCategoryValue] = useState(category ?? categoryOptions?.[0]?.value ?? "");
  const [fieldError, setFieldError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    setFieldError("");
    setSubmitError("");
    if (!date || !time || !zone) {
      setFieldError("Pick a date, time, and timezone.");
      return;
    }
    let runAt: Date;
    try {
      runAt = zonedWallTimeToUtc(date, time, zone);
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : "Choose a valid date and time.");
      return;
    }
    if (runAt.getTime() <= Date.now()) {
      setFieldError("Choose a date and time in the future.");
      return;
    }
    if (!envId) {
      setFieldError("Choose an environment.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        runAt: runAt.toISOString(),
        timeZone: zone,
        environmentId: envId,
        category: categoryOptions ? categoryValue : undefined,
      });
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not schedule this run.");
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => {
        if (!submitting) onClose();
      }}
      closeOnEscape
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button loading={submitting} disabled={submitting || environments.length === 0} onClick={() => void submit()}>
            {!submitting ? <CalendarClock /> : null}
            {submitting ? "Scheduling…" : "Schedule"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {environments.length === 0 ? (
          <Alert variant="warning">No environments are configured for this project. Add one before scheduling a run.</Alert>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            type="date"
            label="Date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="tabular-nums"
            disabled={submitting}
          />
          <Input
            type="time"
            label="Time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className="tabular-nums"
            disabled={submitting}
          />
        </div>
        <Select
          label="Timezone"
          value={zone}
          onChange={setZone}
          disabled={submitting}
          options={timeZones.map((item) => ({ value: item, label: item }))}
        />
        {environments.length > 1 ? (
          <Select
            label="Environment"
            value={envId}
            onChange={setEnvId}
            disabled={submitting}
            options={environments.map((env) => ({ value: env.id, label: env.name }))}
          />
        ) : null}
        {categoryOptions ? (
          <Select
            label="Category"
            value={categoryValue}
            onChange={setCategoryValue}
            disabled={submitting}
            options={categoryOptions}
          />
        ) : null}
        {fieldError ? (
          <p role="alert" className="text-xs text-destructive">
            {fieldError}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Runs once. Test cases are picked up when the run starts.</p>
        )}
        {submitError ? <Alert variant="error">{submitError}</Alert> : null}
      </form>
    </Modal>
  );
}
