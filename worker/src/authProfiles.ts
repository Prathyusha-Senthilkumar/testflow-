import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import { DecryptError, SecretKeyError, decryptMapping, encryptMapping, secretKeyFromEnv } from "./fernet.js";
import { supabase } from "./runs.js";

// ADR-004 hybrid auth, ported from automation/framework/auth_session.py + auth_refresh.py:
//   restore saved session -> validate against the page the test opens -> if unusable, run the
//   configured refresh -> else sign in with the stored credentials -> save the fresh session back
//   encrypted -> run. Sessions and credentials stay in memory; nothing secret is written to disk
//   or logged. Any failure is reported as "Test not started: ...".

export type StorageState = { cookies: unknown[]; origins: unknown[] };
type Credentials = { username: string; password: string };
type RefreshConfig = {
  strategy?: string;
  url?: string;
  method?: string;
  origin?: string;
  accessTokenKey?: string;
  refreshTokenKey?: string;
  sendToken?: string;
  accessTokenJsonPath?: string;
  refreshTokenJsonPath?: string;
  authorizationHeader?: string;
};

export type AuthProfileRecord = {
  projectId: string;
  profileId: string;
  loginUrl: string;
  refresh: RefreshConfig | null;
  storageState: StorageState | null;
  credentials: Credentials | null;
};

export class AuthProfileError extends Error {}

const PASSWORD_SELECTOR = 'input[type="password"]';
const USERNAME_SELECTORS = [
  'input[type="email"]',
  'input[name*="user" i]',
  'input[name*="email" i]',
  'input[id*="user" i]',
  'input[id*="email" i]',
  'input[type="text"]',
];
const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button:has-text("Log in")',
  'button:has-text("Login")',
  'button:has-text("Sign in")',
];
const NAV_TIMEOUT_MS = 30_000;

function asState(value: unknown): StorageState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    cookies: Array.isArray(record.cookies) ? record.cookies : [],
    origins: Array.isArray(record.origins) ? record.origins : [],
  };
}

function asCredentials(value: unknown): Credentials | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const username = typeof record.username === "string" ? record.username : "";
  const password = typeof record.password === "string" ? record.password : "";
  return username && password ? { username, password } : null;
}

function decryptField(token: string, label: string): Record<string, unknown> | null {
  if (!token.trim()) return null;
  try {
    return decryptMapping(token, secretKeyFromEnv());
  } catch (error) {
    if (error instanceof SecretKeyError) throw new AuthProfileError(error.message);
    if (error instanceof DecryptError) throw new AuthProfileError(`The Auth Profile ${label} could not be decrypted. ${error.message}`);
    throw error;
  }
}

/** Load and decrypt one profile. Supabase in normal mode; local files in demo mode (upstream behaviour). */
export async function loadAuthProfile(repoRoot: string, projectId: string, profileId: string): Promise<AuthProfileRecord> {
  const db = supabase();
  if (!db) return loadLocalProfile(repoRoot, projectId, profileId);
  const { data, error } = await db
    .from("auth_profiles")
    .select("id,login_url,refresh,credentials_enc,storage_state_enc")
    .eq("project_id", projectId)
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw new AuthProfileError("The Auth Profile could not be loaded.");
  if (!data) throw new AuthProfileError("The Auth Profile attached to this test no longer exists.");
  return {
    projectId,
    profileId,
    loginUrl: String(data.login_url || ""),
    refresh: data.refresh && typeof data.refresh === "object" ? (data.refresh as RefreshConfig) : null,
    storageState: asState(decryptField(String(data.storage_state_enc || ""), "session")),
    credentials: asCredentials(decryptField(String(data.credentials_enc || ""), "credentials")),
  };
}

function profileDir(repoRoot: string, projectId: string, profileId: string): string {
  for (const segment of [projectId, profileId]) {
    if (!/^[\w-]+$/.test(segment)) throw new AuthProfileError("Invalid Auth Profile reference.");
  }
  return path.join(repoRoot, "automation", "auth-profiles", projectId, profileId);
}

async function loadLocalProfile(repoRoot: string, projectId: string, profileId: string): Promise<AuthProfileRecord> {
  const dir = profileDir(repoRoot, projectId, profileId);
  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(await readFile(path.join(dir, "profile.json"), "utf8")) as Record<string, unknown>;
  } catch {
    throw new AuthProfileError("The Auth Profile attached to this test no longer exists.");
  }
  const storage = await readFile(path.join(dir, "storage_state.json"), "utf8").catch(() => "");
  const credentialsToken = await readFile(path.join(dir, "credentials.enc"), "utf8").catch(() => "");
  let storageState: StorageState | null = null;
  if (storage.trim()) {
    try {
      storageState = asState(JSON.parse(storage));
    } catch {
      storageState = null;
    }
  }
  return {
    projectId,
    profileId,
    loginUrl: String(meta.loginUrl || ""),
    refresh: meta.refresh && typeof meta.refresh === "object" ? (meta.refresh as RefreshConfig) : null,
    storageState,
    credentials: asCredentials(decryptField(credentialsToken, "credentials")),
  };
}

/** Save a renewed session encrypted (Supabase) or to the demo file. Never logs contents. */
export async function saveStorageState(repoRoot: string, profile: AuthProfileRecord, state: StorageState): Promise<void> {
  const db = supabase();
  if (!db) {
    await writeFile(path.join(profileDir(repoRoot, profile.projectId, profile.profileId), "storage_state.json"), JSON.stringify(state), {
      encoding: "utf8",
      mode: 0o600,
    });
    return;
  }
  let token: string;
  try {
    token = encryptMapping(state as unknown as Record<string, unknown>, secretKeyFromEnv());
  } catch (error) {
    throw new AuthProfileError(error instanceof Error ? error.message : "Could not encrypt the session.");
  }
  const { error } = await db
    .from("auth_profiles")
    .update({ storage_state_enc: token })
    .eq("id", profile.profileId)
    .eq("project_id", profile.projectId);
  if (error) throw new AuthProfileError("The renewed session could not be saved.");
}

export type SessionOutcome = { state: StorageState; outcome: "reused" | "refreshed" | "credentials_recovered" };

type Log = (message: string) => void;

/** Guarantee a session that reaches targetUrl. Throws AuthProfileError with a tester-facing reason. */
export async function ensureAuthenticatedSession(
  browser: Browser,
  profile: AuthProfileRecord,
  targetUrl: string,
  log: Log
): Promise<SessionOutcome> {
  if (!targetUrl) throw new AuthProfileError("No start URL is available to validate the authenticated session.");

  if (profile.storageState) {
    const reused = await sessionGrantsAccess(browser, profile.storageState, targetUrl, log);
    if (reused) return { state: reused, outcome: "reused" };
  }

  let refreshAttempted = false;
  if (refreshConfigured(profile.refresh)) {
    refreshAttempted = true;
    const refreshed = await refreshAndRevalidate(browser, profile.storageState, targetUrl, profile.refresh!, log);
    if (refreshed) return { state: refreshed, outcome: "refreshed" };
    log("Refresh did not restore access. Trying stored credentials.");
  }

  if (!profile.credentials) {
    throw new AuthProfileError(
      refreshAttempted
        ? "The saved session is no longer usable, refresh could not restore it, and this Auth Profile has no stored credentials. Add credentials to the Auth Profile (or use Record Login) so TestFlow can sign in automatically."
        : profile.storageState
          ? "The saved session is no longer usable and this Auth Profile has no stored credentials. Add credentials to the Auth Profile (or use Record Login) so TestFlow can sign in automatically."
          : "This Auth Profile has no saved session and no stored credentials. Use Record Login or add credentials."
    );
  }
  log("stage=credential_login");
  const state = await loginWithCredentials(browser, profile.loginUrl, profile.credentials, targetUrl, log);
  return { state, outcome: "credentials_recovered" };
}

async function withContext<T>(browser: Browser, state: StorageState | null, run: (context: BrowserContext) => Promise<T>): Promise<T> {
  const context = await browser.newContext(state ? { storageState: state as never } : {});
  context.setDefaultTimeout(NAV_TIMEOUT_MS);
  try {
    return await run(context);
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function landedOnLogin(page: Page): Promise<boolean> {
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(1_500).catch(() => undefined);
  try {
    const pathname = new URL(page.url()).pathname.toLowerCase();
    if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  } catch {
    return false;
  }
  return (await page.locator(PASSWORD_SELECTOR).count().catch(() => 0)) > 0;
}

async function sessionGrantsAccess(browser: Browser, state: StorageState, targetUrl: string, log: Log): Promise<StorageState | null> {
  try {
    return await withContext(browser, state, async (context) => {
      const page = await context.newPage();
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      if (await landedOnLogin(page)) {
        log("Saved session no longer grants access (login screen shown).");
        return null;
      }
      log("Saved session is valid; reusing it.");
      return asState(await context.storageState());
    });
  } catch (error) {
    log(`Could not validate saved session: ${safeError(error)}`);
    return null;
  }
}

export function refreshConfigured(config: RefreshConfig | null): boolean {
  if (!config) return false;
  const strategy = String(config.strategy || "").trim();
  return (strategy === "cookie" || strategy === "localStorage") && Boolean(String(config.url || "").trim());
}

async function refreshAndRevalidate(
  browser: Browser,
  state: StorageState | null,
  targetUrl: string,
  config: RefreshConfig,
  log: Log
): Promise<StorageState | null> {
  try {
    return await withContext(browser, state, async (context) => {
      try {
        await attemptRefresh(context, state, config, log);
      } catch (error) {
        log(`stage=refresh_failed ${safeError(error)}`);
        return null;
      }
      const page = await context.newPage();
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      if (await landedOnLogin(page)) {
        log("stage=refresh_failed Refresh completed but the protected page still shows a login screen.");
        return null;
      }
      log("Saved the refreshed session.");
      return asState(await context.storageState());
    });
  } catch (error) {
    log(`stage=refresh_failed Could not run refresh (${safeError(error)}).`);
    return null;
  }
}

async function attemptRefresh(context: BrowserContext, state: StorageState | null, config: RefreshConfig, log: Log): Promise<void> {
  const url = String(config.url || "").trim();
  const method = String(config.method || "POST").trim().toUpperCase();
  if (method !== "GET" && method !== "POST") throw new Error("Refresh method must be GET or POST.");
  log("stage=refresh_attempt");
  if (config.strategy === "cookie") {
    // context.request shares the context's cookie jar, so Set-Cookie lands in the session.
    const response = await context.request.fetch(url, { method });
    if (response.status() >= 400) throw new Error(`Refresh request failed with HTTP ${response.status()}.`);
    log("stage=refresh_http_ok");
    return;
  }
  const origin = String(config.origin || "").trim() || new URL(url).origin;
  const accessKey = String(config.accessTokenKey || "").trim();
  const refreshKey = String(config.refreshTokenKey || "").trim();
  const accessPath = String(config.accessTokenJsonPath || "").trim();
  const refreshPath = String(config.refreshTokenJsonPath || "").trim();
  if (!accessKey || !refreshKey || !accessPath) {
    throw new Error("localStorage refresh needs accessTokenKey, refreshTokenKey and accessTokenJsonPath.");
  }
  const send = String(config.sendToken || "refreshToken");
  const token = readLocal(state, origin, send === "refreshToken" ? refreshKey : accessKey);
  if (!token) throw new Error("The configured token key was not present in saved localStorage.");
  const header = String(config.authorizationHeader || "Authorization").trim() || "Authorization";
  const response = await context.request.fetch(url, { method, headers: { [header]: `Bearer ${token}` } });
  if (response.status() >= 400) throw new Error(`Refresh request failed with HTTP ${response.status()}.`);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Refresh response was not JSON.");
  }
  const newAccess = dig(body, accessPath);
  if (typeof newAccess !== "string" || !newAccess) throw new Error("Refresh response did not include the configured access token field.");
  const updates = [{ key: accessKey, value: newAccess }];
  const newRefresh = refreshPath ? dig(body, refreshPath) : null;
  if (typeof newRefresh === "string" && newRefresh) updates.push({ key: refreshKey, value: newRefresh });
  const page = await context.newPage();
  await page.goto(origin.endsWith("/") ? origin : `${origin}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate((entries) => {
    for (const entry of entries) window.localStorage.setItem(entry.key, entry.value);
  }, updates);
  log("stage=refresh_http_ok");
}

export function readLocal(state: StorageState | null, origin: string, key: string): string | null {
  for (const entry of (state?.origins || []) as { origin?: string; localStorage?: { name?: string; value?: unknown }[] }[]) {
    if (entry?.origin !== origin) continue;
    for (const item of entry.localStorage || []) {
      if (item?.name === key && typeof item.value === "string") return item.value;
    }
  }
  return null;
}

export function dig(payload: unknown, dotted: string): unknown {
  let current: unknown = payload;
  for (const part of dotted.split(".").filter(Boolean)) {
    if (!current || typeof current !== "object" || !(part in (current as Record<string, unknown>))) return null;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

async function loginWithCredentials(
  browser: Browser,
  loginUrl: string,
  credentials: Credentials,
  targetUrl: string,
  log: Log
): Promise<StorageState> {
  if (!loginUrl) throw new AuthProfileError("The Auth Profile has no login URL, so automatic sign-in is not possible.");
  return withContext(browser, null, async (context) => {
    const page = await context.newPage();
    try {
      await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    } catch (error) {
      throw new AuthProfileError(`The login page could not be opened (${safeError(error)}).`);
    }
    const password = page.locator(PASSWORD_SELECTOR).first();
    if ((await password.count()) === 0) {
      throw new AuthProfileError("No password field was found on the login page, so automatic sign-in is not possible for this application.");
    }
    let username = null;
    for (const selector of USERNAME_SELECTORS) {
      const candidate = page.locator(selector).first();
      if ((await candidate.count().catch(() => 0)) > 0 && (await candidate.isVisible().catch(() => false))) {
        username = candidate;
        break;
      }
    }
    if (!username) throw new AuthProfileError("No username/email field was found on the login page.");
    await username.fill(credentials.username);
    await password.fill(credentials.password);
    let submitted = false;
    for (const selector of SUBMIT_SELECTORS) {
      const button = page.locator(selector).first();
      if ((await button.count().catch(() => 0)) > 0 && (await button.isVisible().catch(() => false))) {
        await button.click();
        submitted = true;
        break;
      }
    }
    if (!submitted) await password.press("Enter");
    await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT_MS }).catch(() => undefined);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    if (await landedOnLogin(page)) {
      throw new AuthProfileError(
        "Automatic sign-in with the stored credentials did not produce an authenticated session. Check the credentials on the Auth Profile."
      );
    }
    log("Signed in automatically with the stored Auth Profile credentials.");
    const state = asState(await context.storageState());
    if (!state) throw new AuthProfileError("Sign-in succeeded but no session could be captured.");
    return state;
  });
}

function safeError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return (text.split("\n")[0] || "error").slice(0, 180);
}

/** The page the recorded script opens first, else the resolved start URL (same rule as the Python bridge). */
export function pageTheScriptOpens(source: string, fallback: string): string {
  const match = source.match(/page\.goto\(\s*["']([^"']+)["']/);
  return match ? match[1] : fallback;
}

/** True when the renewed state differs from what was loaded (so it is worth saving). */
export function stateChanged(before: StorageState | null, after: StorageState): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}
