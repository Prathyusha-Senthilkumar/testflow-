"use client";

import { useEffect } from "react";

export function RecoveryRedirect() {
  useEffect(() => {
    if (window.location.pathname === "/reset-password") return;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (hash.get("type") === "recovery" && hash.get("access_token")) {
      window.location.replace(`/reset-password${window.location.hash}`);
    }
  }, []);
  return null;
}
