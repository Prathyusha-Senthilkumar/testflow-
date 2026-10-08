import type { AppNotification, NotificationSeverity } from "./api";

/** Window event fired when the user starts a run, so the bell refetches right away. */
export const RUN_STARTED_EVENT = "testflow-run-started";

/** Call after starting a run (single test, suite or project) to refresh notification counts. */
export function notifyRunStarted() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RUN_STARTED_EVENT));
}

/** Badge text for an unread count: "" for 0, "9+" above 9. */
export function badgeText(count: number): string {
  if (!count || count < 1) return "";
  return count > 9 ? "9+" : String(count);
}

export type NotificationGroup = { label: "Today" | "Earlier"; items: AppNotification[] };

/** Splits notifications (newest first) into Today / Earlier by local calendar day. */
export function groupByDay(items: AppNotification[], now: Date = new Date()): NotificationGroup[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const today: AppNotification[] = [];
  const earlier: AppNotification[] = [];
  for (const item of items) {
    const at = new Date(item.createdAt).getTime();
    (Number.isFinite(at) && at >= startOfToday ? today : earlier).push(item);
  }
  const groups: NotificationGroup[] = [];
  if (today.length) groups.push({ label: "Today", items: today });
  if (earlier.length) groups.push({ label: "Earlier", items: earlier });
  return groups;
}

/** Compact relative time: "just now", "5m ago", "3h ago", "2d ago", else a short date. */
export function relativeTime(value: string, now: Date = new Date()): string {
  const at = new Date(value).getTime();
  if (!Number.isFinite(at)) return "";
  const seconds = Math.max(0, Math.round((now.getTime() - at) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Text colour class per severity (status colours only). */
export const SEVERITY_TONE: Record<NotificationSeverity, string> = {
  error: "text-destructive",
  success: "text-pass",
  warning: "text-warning",
  info: "text-info",
};

/** Only follow app-relative links ("/…"), never absolute or protocol-relative URLs. */
export function safeNotificationLink(link: string | null | undefined): string | null {
  if (!link || !link.startsWith("/") || link.startsWith("//")) return null;
  return link;
}
