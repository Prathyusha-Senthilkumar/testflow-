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
