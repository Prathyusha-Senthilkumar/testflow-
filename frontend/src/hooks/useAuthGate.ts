"use client";

import { useEffect } from "react";
import { useNavigate } from "@/lib/navigation";
import { ensureSession } from "@/lib/api";
import { useAccount, useHydrated } from "@/hooks/useAccount";

/**
 * Guards authenticated routes. Reads the stored account synchronously,
 * redirects to /login when there is none (or it is cleared after a failed
 * refresh), and kicks off the shared single-flight token refresh.
 * `ready` is true when content may render and fetch.
 */
export function useAuthGate(): { ready: boolean } {
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const account = useAccount();

  useEffect(() => {
    if (!hydrated) return;
    if (!account) {
      const { pathname, search } = window.location;
      navigate(`/login?next=${encodeURIComponent(pathname + search)}`);
      return;
    }
    // Shares one in-flight refresh with performRequest; clears the account on failure,
    // which re-runs this effect and redirects.
    void ensureSession();
  }, [hydrated, account, navigate]);

  return { ready: hydrated && Boolean(account) };
}
