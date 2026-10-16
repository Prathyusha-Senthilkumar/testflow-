// Redis maxmemory / noeviction rejects writes immediately. Those replies must not be
// tight-retried: several workers would keep issuing the same failing commands.

const REDIS_OOM_TEXT = /OOM command not allowed when used memory\s*>\s*['"]maxmemory['"]/i;

/** Shown on a run or agent job. No host, URL, or credential. */
export const REDIS_FULL_MESSAGE =
  "Redis is full, so this could not be saved. Free memory and try again.";

export const OOM_BACKOFF_MIN_MS = 30_000;
export const OOM_BACKOFF_MAX_MS = 120_000;
/** After writes are allowed again, wait this long before requeueing orphans so owners can refresh leases. */
export const OOM_REAP_TRAIL_MS = 30_000;

let writesBlockedUntil = 0;
let reapBlockedUntil = 0;
let onRedisFull: (() => void) | null = null;

export function resetRedisOomForTests(): void {
  writesBlockedUntil = 0;
  reapBlockedUntil = 0;
  onRedisFull = null;
}

/** Fires once per backoff window, when the pause starts. Used to mark in-flight runs. */
export function setRedisFullHandler(handler: (() => void) | null): void {
  onRedisFull = handler;
}

export function oomBackoffMs(random = Math.random()): number {
  const unit = Math.min(1, Math.max(0, random));
  const span = OOM_BACKOFF_MAX_MS - OOM_BACKOFF_MIN_MS;
  const offset = Math.min(span, Math.floor(unit * (span + 1)));
  return OOM_BACKOFF_MIN_MS + offset;
}

/**
 * Lease key lifetime. The extra max backoff keeps the key alive when a refresh is rejected,
 * so a full Redis does not look like a dead worker. Callers still refresh on the normal cadence.
 */
export function leaseTtlSeconds(leaseSeconds: number): number {
  return leaseSeconds + Math.ceil(OOM_BACKOFF_MAX_MS / 1000);
}

export function isRedisOom(error: unknown): boolean {
  return REDIS_OOM_TEXT.test(errorText(error));
}

/**
 * Record one maxmemory rejection. The failed command is not retried here.
 * Returns how long to wait before the next write (at least 30s, jittered, capped).
 * A later call inside that window does not start a new, sooner retry.
 */
export function noteRedisOom(now = Date.now(), random = Math.random()): number {
  if (now < writesBlockedUntil) return writesBlockedUntil - now;
  const wait = oomBackoffMs(random);
  writesBlockedUntil = now + wait;
  const reapUntil = writesBlockedUntil + OOM_REAP_TRAIL_MS;
  if (reapUntil > reapBlockedUntil) reapBlockedUntil = reapUntil;
  onRedisFull?.();
  return wait;
}

/**
 * Delay before another attempt after this error.
 * Null means it is not a maxmemory rejection, so the caller keeps its normal retry.
 */
export function redisRetryDelayMs(error: unknown, now = Date.now(), random = Math.random()): number | null {
  if (!isRedisOom(error)) return null;
  return noteRedisOom(now, random);
}

export function redisWriteDelayMs(now = Date.now()): number {
  return Math.max(0, writesBlockedUntil - now);
}

export function redisWritesPaused(now = Date.now()): boolean {
  return redisWriteDelayMs(now) > 0;
}

export function redisReapPaused(now = Date.now()): boolean {
  return now < reapBlockedUntil;
}

/** OOM inside a MULTI/EXEC reply list. Other command errors are left alone. */
export function throwIfRedisOom(results: unknown): void {
  if (!Array.isArray(results)) return;
  for (const entry of results) {
    if (Array.isArray(entry) && isRedisOom(entry[0])) throw entry[0];
  }
}

function errorText(error: unknown, depth = 0): string {
  if (error == null || depth > 5) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    const cause = error.cause === undefined ? "" : errorText(error.cause, depth + 1);
    const nested = nestedErrors(error, depth);
    return `${error.message} ${cause} ${nested}`;
  }
  if (typeof error === "object") {
    const record = error as { message?: unknown; cause?: unknown };
    return `${errorText(record.message, depth + 1)} ${errorText(record.cause, depth + 1)} ${nestedErrors(error, depth)}`;
  }
  return String(error);
}

function nestedErrors(error: object, depth: number): string {
  if (!("errors" in error) || !Array.isArray((error as { errors: unknown }).errors)) return "";
  return (error as { errors: unknown[] }).errors.map((item) => errorText(item, depth + 1)).join(" ");
}
