"use client";

import { useCallback, useSyncExternalStore } from "react";
import { readRecent, subscribeRecent, type RecentItem } from "@/lib/search";

const EMPTY: RecentItem[] = [];
const cache = new Map<string, { raw: string; items: RecentItem[] }>();

/** The signed-in user's recently opened items (newest first), kept in sync across tabs. */
export function useRecentItems(userId: string | null | undefined): RecentItem[] {
  const getSnapshot = useCallback(() => {
    if (!userId) return EMPTY;
    const items = readRecent(userId);
    const raw = JSON.stringify(items);
    const hit = cache.get(userId);
    if (hit && hit.raw === raw) return hit.items;
    cache.set(userId, { raw, items });
    return items;
  }, [userId]);
  return useSyncExternalStore(subscribeRecent, getSnapshot, () => EMPTY);
}
