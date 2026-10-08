const STORAGE_KEY = "testflow.account";

export type Account = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  name: string;
};

export function readAccount(): Account | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Account;
    if (!parsed.accessToken || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeAccount(account: Account) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
  window.dispatchEvent(new Event("testflow-account"));
}

export function clearAccount() {
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("testflow-account"));
}

export function accountInitials(account: Pick<Account, "name" | "email">): string {
  const source = account.name.trim() || account.email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function tokenExpiry(token: string): number {
  try {
    const payload = token.split(".")[1];
    if (!payload) return 0;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return Number(json.exp || 0) * 1000;
  } catch {
    return 0;
  }
}

export function accountNeedsRefresh(account: Account): boolean {
  const expiry = tokenExpiry(account.accessToken);
  return !expiry || expiry - Date.now() < 60_000;
}

/* ------------------------------------------------------------------ */
/* Reactive account store (for useSyncExternalStore).                  */
/* ------------------------------------------------------------------ */

let snapshotRaw: string | null | undefined;
let snapshotAccount: Account | null = null;

/** Subscribes to sign-in/out in this tab and to storage changes from other tabs. */
export function subscribeAccount(callback: () => void): () => void {
  window.addEventListener("testflow-account", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("testflow-account", callback);
    window.removeEventListener("storage", callback);
  };
}

/** Referentially stable snapshot of the stored account. */
export function getAccountSnapshot(): Account | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw !== snapshotRaw) {
    snapshotRaw = raw;
    snapshotAccount = readAccount();
  }
  return snapshotAccount;
}

/* ------------------------------------------------------------------ */
/* Single-flight token refresh.                                        */
/* ------------------------------------------------------------------ */

export type RefreshResult = {
  accessToken?: string | null;
  refreshToken?: string | null;
  userId?: string | null;
  email: string;
  name: string;
};

let refreshInFlight: Promise<Account | null> | null = null;

/**
 * Returns a usable account, refreshing the access token first when it is
 * about to expire. Concurrent callers share one in-flight refresh, so the
 * refresh token is only ever spent once (Supabase refresh-token reuse
 * detection would otherwise revoke the session). On failure the stored
 * account is cleared and `null` is returned.
 */
export function ensureFreshAccount(refresher: (refreshToken: string) => Promise<RefreshResult>): Promise<Account | null> {
  const account = readAccount();
  if (!account) return Promise.resolve(null);
  if (!accountNeedsRefresh(account)) return Promise.resolve(account);
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = refresher(account.refreshToken)
    .then((fresh) => {
      if (!fresh.accessToken || !fresh.refreshToken || !fresh.userId) throw new Error("expired");
      const next: Account = {
        accessToken: fresh.accessToken,
        refreshToken: fresh.refreshToken,
        userId: fresh.userId,
        email: fresh.email,
        name: fresh.name,
      };
      writeAccount(next);
      return next;
    })
    .catch(() => {
      clearAccount();
      return null;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/**
 * Post-login destination from a `?next=` query: only same-origin relative
 * paths ("/..."), never protocol-relative ("//host") or absolute URLs.
 */
export function safeNextPath(search: string, fallback = "/dashboard"): string {
  const next = new URLSearchParams(search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next === "/login" || next.startsWith("/login?")) return fallback;
  return next;
}
