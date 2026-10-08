"use client";

import { friendlyRunError } from "@/lib/friendlyRunError";
import { AlertTriangle, BellOff, Check, CheckCircle2, Info, Mail, Settings, X, XCircle, type LucideIcon } from "lucide-react";
import type { AppNotification, NotificationSeverity } from "@/lib/api";
import { SEVERITY_TONE, groupByDay, relativeTime } from "@/lib/notifications";
import { Link } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AttestLoader } from "@/components/brand/attest-loader";
import type { NotificationTab } from "@/hooks/useNotifications";

const SEVERITY_ICON: Record<NotificationSeverity, LucideIcon> = {
  error: XCircle,
  success: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
};

export type NotificationsPanelProps = {
  tab: NotificationTab;
  onTabChange: (tab: NotificationTab) => void;
  items: AppNotification[];
  unreadCount: number;
  loading?: boolean;
  loadingMore?: boolean;
  error?: string;
  hasMore?: boolean;
  onOpen: (item: AppNotification) => void;
  onMarkRead: (id: string) => void;
  /** Optional: omit to hide the "Mark unread" action. */
  onMarkUnread?: (id: string) => void;
  onDismiss: (id: string) => void;
  onMarkAllRead: () => void;
  onLoadMore: () => void;
  /** Called when the settings link is followed (to close the popover). */
  onNavigateAway?: () => void;
  /** Reference time for grouping and relative times (stories/tests). */
  now?: Date;
  className?: string;
};

function ItemAction({ label, icon: Icon, onClick }: { label: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          className="grid size-6 place-items-center rounded-sm text-muted-foreground transition-colors duration-[120ms] hover:bg-state-pressed hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Icon className="size-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function NotificationItem({
  item,
  now,
  onOpen,
  onMarkRead,
  onMarkUnread,
  onDismiss,
}: {
  item: AppNotification;
  now?: Date;
  onOpen: (item: AppNotification) => void;
  onMarkRead: (id: string) => void;
  onMarkUnread?: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const Icon = SEVERITY_ICON[item.severity] ?? Info;
  return (
    <li className="group relative">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(item)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen(item);
          }
        }}
        aria-label={`${item.read ? "" : "Unread: "}${item.title}`}
        className={cn(
          "flex cursor-pointer gap-3 rounded-md px-2.5 py-2.5 outline-none transition-colors duration-[120ms] hover:bg-state-hover focus-visible:bg-state-hover focus-visible:ring-2 focus-visible:ring-ring",
          !item.read && "bg-state-active/40"
        )}
      >
        <Icon className={cn("mt-0.5 size-4 shrink-0", SEVERITY_TONE[item.severity] ?? "text-info")} aria-hidden />
        <div className="min-w-0 flex-1 pr-12">
          <p className={cn("flex items-center gap-1.5 text-[13px] leading-5 text-foreground", item.read ? "font-normal" : "font-medium")}>
            {!item.read ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" /> : null}
            <span className="min-w-0 truncate">{item.title}</span>
          </p>
          {item.body ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground" title={item.type === "run_failed" ? item.body : undefined}>
              {item.type === "run_failed" ? friendlyRunError(item.body) : item.body}
            </p>
          ) : null}
          <p className="mt-1 flex items-center gap-2 text-xs text-faint">
            <time dateTime={item.createdAt} className="tabular-nums">
              {relativeTime(item.createdAt, now)}
            </time>
            {item.projectName ? (
              <span className="max-w-40 truncate rounded-sm border border-border px-1.5 text-[11px] text-muted-foreground">{item.projectName}</span>
            ) : null}
          </p>
        </div>
      </div>
      <div className="reveal-on-hover absolute top-2 right-2 flex items-center gap-0.5">
        {!item.read ? (
          <ItemAction label="Mark as read" icon={Check} onClick={() => onMarkRead(item.id)} />
        ) : onMarkUnread ? (
          <ItemAction label="Mark unread" icon={Mail} onClick={() => onMarkUnread(item.id)} />
        ) : null}
        <ItemAction label="Dismiss" icon={X} onClick={() => onDismiss(item.id)} />
      </div>
    </li>
  );
}

/** Presentational notifications panel (data in via props; no fetching). */
export function NotificationsPanel({
  tab,
  onTabChange,
  items,
  unreadCount,
  loading = false,
  loadingMore = false,
  error,
  hasMore = false,
  onOpen,
  onMarkRead,
  onMarkUnread,
  onDismiss,
  onMarkAllRead,
  onLoadMore,
  onNavigateAway,
  now,
  className,
}: NotificationsPanelProps) {
  const groups = groupByDay(items, now);

  return (
    <div data-slot="notifications-panel" className={cn("flex max-h-[min(70vh,640px)] min-h-0 flex-col", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 pt-3 pb-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          Notifications
          {unreadCount > 0 ? (
            <span className="rounded-sm bg-state-active px-1.5 text-xs font-medium text-brand-accent tabular-nums">{unreadCount} new</span>
          ) : null}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onMarkAllRead} disabled={unreadCount === 0 || loading}>
            Mark all read
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" asChild>
                <Link to="/settings#notifications" aria-label="Notification settings" onClick={onNavigateAway}>
                  <Settings />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Notification settings</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <Tabs value={tab} onValueChange={(value) => onTabChange(value as NotificationTab)} className="shrink-0 px-3">
        <TabsList variant="line" className="h-9 w-full justify-start gap-2 border-b border-border">
          <TabsTrigger value="all" className="flex-none px-1">
            All
          </TabsTrigger>
          <TabsTrigger value="unread" className="flex-none px-1">
            Unread
            {unreadCount > 0 ? <span className="text-xs text-muted-foreground tabular-nums">{unreadCount}</span> : null}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-1.5">
        {loading ? (
          <div className="grid place-items-center py-12">
            <AttestLoader size="md" label="Loading notifications" />
          </div>
        ) : error ? (
          <div className="p-2">
            <Alert variant="error" title="Couldn’t load notifications">
              {error}
            </Alert>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span className="mb-3 grid size-10 place-items-center rounded-md border border-border bg-elevated text-muted-foreground">
              <BellOff className="size-5" aria-hidden />
            </span>
            <p className="text-sm font-semibold">You’re all caught up</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {tab === "unread" ? "No unread notifications." : "Run results and alerts will show up here."}
            </p>
          </div>
        ) : (
          <>
            {groups.map((group) => (
              <section key={group.label} aria-label={group.label}>
                <h3 className="px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-[0.06em] text-faint uppercase">{group.label}</h3>
                <ul className="space-y-0.5">
                  {group.items.map((item) => (
                    <NotificationItem key={item.id} item={item} now={now} onOpen={onOpen} onMarkRead={onMarkRead} onMarkUnread={onMarkUnread} onDismiss={onDismiss} />
                  ))}
                </ul>
              </section>
            ))}
            {hasMore ? (
              <div className="p-2">
                <Button variant="outline" size="sm" className="w-full" onClick={onLoadMore} loading={loadingMore}>
                  Load more
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
