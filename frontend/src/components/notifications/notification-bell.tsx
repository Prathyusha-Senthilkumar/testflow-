"use client";

import { useCallback, useState, type ComponentProps } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "@/lib/navigation";
import type { AppNotification } from "@/lib/api";
import { badgeText, safeNotificationLink } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNotificationList, useUnreadCount, type NotificationTab, type UnreadDelta } from "@/hooks/useNotifications";
import { NotificationsPanel } from "@/components/notifications/notifications-panel";

type BellButtonProps = ComponentProps<typeof Button> & { count: number };

/** Bell icon button with an unread badge ("9+" max). Presentational. */
export function BellButton({ count, className, ...props }: BellButtonProps) {
  const text = badgeText(count);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
      className={cn("relative", className)}
      {...props}
    >
      <Bell />
      {text ? (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums ring-2 ring-chrome"
        >
          {text}
        </span>
      ) : null}
    </Button>
  );
}

/**
 * Top-bar notifications: bell + unread badge, a popover panel on desktop
 * and a full-width sheet on mobile.
 */
export function NotificationBell() {
  const navigate = useNavigate();
  const { count, setCount, refresh } = useUnreadCount();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState<NotificationTab>("all");
  const open = popoverOpen || sheetOpen;

  const onUnreadDelta = useCallback(
    (delta: UnreadDelta) =>
      setCount((current) =>
        delta === "reset" ? 0 : typeof delta === "number" ? Math.max(0, current + delta) : Math.max(0, delta.exact)
      ),
    [setCount]
  );
  const list = useNotificationList(open, tab, onUnreadDelta);

  function close() {
    setPopoverOpen(false);
    setSheetOpen(false);
  }

  function openItem(item: AppNotification) {
    void list.markRead(item.id);
    const link = safeNotificationLink(item.link);
    close();
    if (link) navigate(link);
  }

  const panel = (
    <NotificationsPanel
      tab={tab}
      onTabChange={setTab}
      items={list.items}
      unreadCount={count}
      loading={list.loading}
      loadingMore={list.loadingMore}
      error={list.error}
      hasMore={Boolean(list.nextCursor)}
      onOpen={openItem}
      onMarkRead={(id) => void list.markRead(id)}
      onMarkUnread={(id) => void list.markUnread(id)}
      onDismiss={(id) => void list.dismiss(id)}
      onMarkAllRead={() => {
        void list.markAllRead().then(() => refresh());
      }}
      onLoadMore={() => void list.loadMore()}
      onNavigateAway={close}
    />
  );

  return (
    <>
      <Popover
        open={popoverOpen}
        onOpenChange={(next) => {
          setPopoverOpen(next);
          if (next) void refresh();
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <BellButton count={count} className="hidden md:inline-flex" />
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Notifications</TooltipContent>
        </Tooltip>
        <PopoverContent align="end" sideOffset={8} className="w-[380px] max-w-[calc(100vw-1rem)] overflow-hidden p-0">
          {panel}
        </PopoverContent>
      </Popover>

      <BellButton
        count={count}
        className="md:hidden"
        onClick={() => {
          setSheetOpen(true);
          void refresh();
        }}
      />
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="top" className="max-h-dvh gap-0 bg-popover p-0 pt-8 md:hidden">
          <SheetTitle className="sr-only">Notifications</SheetTitle>
          <SheetDescription className="sr-only">Recent run results and alerts</SheetDescription>
          {sheetOpen ? panel : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
