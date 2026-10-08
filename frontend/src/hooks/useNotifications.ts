"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@/lib/navigation";
import { api, ApiError, isNotFoundError, type AppNotification } from "@/lib/api";
import { RUN_STARTED_EVENT, safeNotificationLink } from "@/lib/notifications";

const POLL_MS = 30_000;

/**
 * Unread notification count for the bell. Polls every 30s while the tab is
 * visible, refetches on window focus and when a run starts. When the count
 * goes up between polls, shows one toast for the newest unread item (never on
 * the first load). A 404 (old backend) or any error reads as 0, silently.
 */
export function useUnreadCount() {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const previous = useRef<number | null>(null);
  const inFlight = useRef(false);
  // Old backend without /notifications: stop polling for this page session.
  const unsupported = useRef(false);
  const warned = useRef(false);

  const announceNewest = useCallback(async () => {
    try {
      const page = await api.notifications({ unreadOnly: true, limit: 1 });
      const newest = page.items[0];
      if (!newest) return;
      const link = safeNotificationLink(newest.link);
      const action = link ? { label: "View", onClick: () => navigate(link) } : undefined;
      const options = { description: newest.body ?? undefined, action };
      if (newest.severity === "error") toast.error(newest.title, options);
      else if (newest.severity === "success") toast.success(newest.title, options);
      else if (newest.severity === "warning") toast.warning(newest.title, options);
      else toast(newest.title, options);
    } catch {
      // The toast is a nicety; the badge already shows the new count.
    }
  }, [navigate]);

  const refresh = useCallback(async () => {
    if (inFlight.current || unsupported.current) return;
    inFlight.current = true;
    try {
      const { unreadCount } = await api.notificationsUnreadCount();
      const next = Math.max(0, unreadCount || 0);
      const before = previous.current;
      previous.current = next;
      setCount(next);
      if (before !== null && next > before) void announceNewest();
    } catch (error) {
      if (isNotFoundError(error)) unsupported.current = true;
      // Server errors (e.g. notifications not set up yet) read as "0 unread", silently.
      if (error instanceof ApiError && error.status >= 500) {
        setCount(0);
        if (!warned.current) {
          warned.current = true;
          console.warn("[Attest] Notifications unavailable:", error.message);
        }
      }
      if (isNotFoundError(error) || previous.current === null) {
        previous.current = previous.current ?? 0;
      }
    } finally {
      inFlight.current = false;
    }
  }, [announceNewest]);

  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(tick, POLL_MS);
    };
    const tick = () => {
      if (unsupported.current) return;
      if (!document.hidden) void refresh();
      schedule();
    };
    const onVisible = () => {
      if (!document.hidden) {
        void refresh();
        schedule();
      }
    };
    const onRefetch = () => void refresh();

    void refresh();
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onRefetch);
    window.addEventListener(RUN_STARTED_EVENT, onRefetch);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onRefetch);
      window.removeEventListener(RUN_STARTED_EVENT, onRefetch);
    };
  }, [refresh]);

  return { count, setCount, refresh };
}

export type NotificationTab = "all" | "unread";

/** Badge update: a relative change, "reset" to 0, or the exact count returned by the server. */
export type UnreadDelta = number | "reset" | { exact: number };

export type NotificationListState = {
  items: AppNotification[];
  loading: boolean;
  loadingMore: boolean;
  error: string;
  nextCursor: string | null;
};

const INITIAL: NotificationListState = { items: [], loading: true, loadingMore: false, error: "", nextCursor: null };

/**
 * Notification list for the open panel. Loads when `open` turns on (and when
 * the tab changes), supports "Load more", and applies read / dismiss /
 * read-all optimistically. `onUnreadDelta` keeps the bell badge in sync.
 */
export function useNotificationList(open: boolean, tab: NotificationTab, onUnreadDelta: (delta: UnreadDelta) => void) {
  const [state, setState] = useState<NotificationListState>(INITIAL);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ ...INITIAL });
    api
      .notifications({ unreadOnly: tab === "unread", limit: 20 })
      .then((page) => {
        if (!cancelled) setState({ items: page.items, loading: false, loadingMore: false, error: "", nextCursor: page.nextCursor });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isNotFoundError(error)) setState({ ...INITIAL, loading: false });
        else setState({ ...INITIAL, loading: false, error: error instanceof Error ? error.message : "Could not load notifications" });
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab]);

  const loadMore = useCallback(async () => {
    const cursor = state.nextCursor;
    if (!cursor || state.loadingMore) return;
    setState((current) => ({ ...current, loadingMore: true }));
    try {
      const page = await api.notifications({ unreadOnly: tab === "unread", limit: 20, before: cursor });
      setState((current) => ({
        ...current,
        items: [...current.items, ...page.items.filter((item) => !current.items.some((existing) => existing.id === item.id))],
        nextCursor: page.nextCursor,
        loadingMore: false,
      }));
    } catch (error) {
      setState((current) => ({ ...current, loadingMore: false }));
      toast.error(error instanceof Error ? error.message : "Could not load more notifications");
    }
  }, [state.nextCursor, state.loadingMore, tab]);

  const markRead = useCallback(
    async (id: string) => {
      const target = state.items.find((item) => item.id === id);
      if (!target || target.read) return;
      setState((current) => ({ ...current, items: current.items.map((item) => (item.id === id ? { ...item, read: true } : item)) }));
      onUnreadDelta(-1);
      try {
        const { unreadCount } = await api.markNotificationRead(id);
        if (typeof unreadCount === "number") onUnreadDelta({ exact: unreadCount });
      } catch {
        setState((current) => ({ ...current, items: current.items.map((item) => (item.id === id ? { ...item, read: false } : item)) }));
        onUnreadDelta(1);
      }
    },
    [state.items, onUnreadDelta]
  );

  const markUnread = useCallback(
    async (id: string) => {
      const target = state.items.find((item) => item.id === id);
      if (!target || !target.read) return;
      setState((current) => ({ ...current, items: current.items.map((item) => (item.id === id ? { ...item, read: false } : item)) }));
      onUnreadDelta(1);
      try {
        const { unreadCount } = await api.markNotificationUnread(id);
        if (typeof unreadCount === "number") onUnreadDelta({ exact: unreadCount });
      } catch (error) {
        setState((current) => ({ ...current, items: current.items.map((item) => (item.id === id ? { ...item, read: true } : item)) }));
        onUnreadDelta(-1);
        toast.error(error instanceof Error ? error.message : "Could not mark the notification unread");
      }
    },
    [state.items, onUnreadDelta]
  );

  const dismiss = useCallback(
    async (id: string) => {
      const index = state.items.findIndex((item) => item.id === id);
      if (index < 0) return;
      const removed = state.items[index];
      setState((current) => ({ ...current, items: current.items.filter((item) => item.id !== id) }));
      if (!removed.read) onUnreadDelta(-1);
      try {
        await api.deleteNotification(id);
      } catch (error) {
        setState((current) => {
          const items = [...current.items];
          items.splice(Math.min(index, items.length), 0, removed);
          return { ...current, items };
        });
        if (!removed.read) onUnreadDelta(1);
        toast.error(error instanceof Error ? error.message : "Could not dismiss the notification");
      }
    },
    [state.items, onUnreadDelta]
  );

  const markAllRead = useCallback(async () => {
    const before = state.items;
    setState((current) => ({ ...current, items: current.items.map((item) => ({ ...item, read: true })) }));
    onUnreadDelta("reset");
    try {
      const { unreadCount } = await api.markAllNotificationsRead();
      if (typeof unreadCount === "number") onUnreadDelta({ exact: unreadCount });
    } catch (error) {
      setState((current) => ({ ...current, items: before }));
      toast.error(error instanceof Error ? error.message : "Could not mark notifications as read");
    }
  }, [state.items, onUnreadDelta]);

  return { ...state, loadMore, markRead, markUnread, dismiss, markAllRead };
}
