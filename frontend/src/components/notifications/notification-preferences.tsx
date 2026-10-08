"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, isNotFoundError, isUnavailableError, type NotificationPreferences } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { AdminDetails } from "@/components/common/AdminDetails";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";

const OPTIONS: { key: keyof NotificationPreferences; label: string; description: string; comingSoon?: boolean }[] = [
  { key: "runFailed", label: "Failed runs", description: "A test run fails or times out." },
  { key: "runPassed", label: "Passed runs", description: "A test run passes." },
  { key: "batchCompleted", label: "Suite and project runs completed", description: "Every test in a suite or project run has finished.", comingSoon: true },
  { key: "runStuck", label: "Stuck runs", description: "A run stays queued or running much longer than expected." },
];

type State =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "notMigrated" }
  | { status: "error"; message: string }
  | { status: "ready"; prefs: NotificationPreferences };

/** Settings → Notifications: per-event toggles, saved immediately (optimistic). */
export function NotificationPreferencesCard() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [saving, setSaving] = useState<keyof NotificationPreferences | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .notificationPreferences()
      .then((prefs) => {
        if (!cancelled) setState({ status: "ready", prefs });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isNotFoundError(error)) setState({ status: "unavailable" });
        else if (isUnavailableError(error)) setState({ status: "notMigrated" });
        else setState({ status: "error", message: error instanceof Error ? error.message : "Could not load preferences" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(key: keyof NotificationPreferences, value: boolean) {
    if (state.status !== "ready") return;
    const previous = state.prefs;
    const next = { ...previous, [key]: value };
    setState({ status: "ready", prefs: next });
    setSaving(key);
    try {
      // Partial update: only the changed key; the server returns the full object.
      const saved = await api.updateNotificationPreferences({ [key]: value });
      setState({ status: "ready", prefs: saved ?? next });
      toast.success("Notification preferences saved.");
    } catch (error) {
      if (isUnavailableError(error)) {
        setState({ status: "notMigrated" });
        return;
      }
      setState({ status: "ready", prefs: previous });
      toast.error(error instanceof Error ? error.message : "Could not save notification preferences");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card id="notifications" className="scroll-mt-6">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Choose which events notify you in Attest.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {state.status === "loading" ? (
          <div className="space-y-4 p-4">
            {OPTIONS.map((option) => (
              <div key={option.key} className="flex items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="h-[1.15rem] w-8 rounded-full" />
              </div>
            ))}
          </div>
        ) : state.status === "unavailable" ? (
          <p className="p-4 text-[13px] text-muted-foreground">Notifications aren’t available on this server yet.</p>
        ) : state.status === "notMigrated" ? (
          <div className="p-4">
            <Alert variant="warning" title="Notification settings aren’t available yet">
              Ask your administrator to finish setting up notifications on the server.
            </Alert>
            <AdminDetails detail="GET/PUT /notifications/preferences returned 503: the notifications table hasn’t been migrated." />
          </div>
        ) : state.status === "error" ? (
          <div className="p-4">
            <Alert variant="error" title="Couldn’t load notification preferences">
              {state.message}
            </Alert>
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {OPTIONS.map((option) => {
              const id = `notify-${option.key}`;
              return (
                <li key={option.key} className="flex items-center justify-between gap-4 px-4 py-3">
                  <label htmlFor={id} className="min-w-0 cursor-pointer">
                    <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                      {option.label}
                      {option.comingSoon ? <Badge variant="outline">Coming soon</Badge> : null}
                    </span>
                    <span className="block text-xs text-muted-foreground">{option.description}</span>
                  </label>
                  <Switch
                    id={id}
                    checked={state.prefs[option.key]}
                    disabled={saving === option.key}
                    onCheckedChange={(value) => void toggle(option.key, value)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
