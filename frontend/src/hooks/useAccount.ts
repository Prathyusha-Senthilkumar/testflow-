"use client";

import { useSyncExternalStore } from "react";
import { getAccountSnapshot, subscribeAccount, type Account } from "@/lib/account";

const noopSubscribe = () => () => {};

/** Signed-in account, read synchronously from localStorage and kept in sync. `null` on the server. */
export function useAccount(): Account | null {
  return useSyncExternalStore(subscribeAccount, getAccountSnapshot, () => null);
}

/** `true` once running in the browser after hydration. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
