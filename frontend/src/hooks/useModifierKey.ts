"use client";

import { useSyncExternalStore } from "react";

function isApplePlatform(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

const subscribe = () => () => {};

/** "⌘" on macOS/iOS, "Ctrl" elsewhere, for keyboard hints. Renders "Ctrl" on the server. */
export function useModifierKey(): string {
  return useSyncExternalStore(subscribe, () => (isApplePlatform() ? "⌘" : "Ctrl"), () => "Ctrl");
}
