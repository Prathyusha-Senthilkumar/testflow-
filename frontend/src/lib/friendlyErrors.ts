/**
 * Maps known operator/infrastructure error messages from the API (setup
 * hints, service commands, file paths) to plain, task-focused text for end
 * users. The original text is kept for administrators: it's logged to the
 * console and shown in a collapsed "Details for administrators" disclosure
 * wherever the friendly message is rendered in an Alert.
 */

type Rule = { test: RegExp; message: string };

const RULES: Rule[] = [
  {
    test: /host playwright recorder is not reachable|host_recorder|recorder is not reachable/i,
    message: "Recording isn’t available right now. Ask your administrator to start the recorder.",
  },
  {
    test: /chromium is not available|playwright install|executable doesn'?t exist|browsertype\.launch/i,
    message: "The test browser isn’t available on the server right now. Ask your administrator to install it.",
  },
  {
    test: /batch queue is not installed/i,
    message: "Running whole suites or projects isn’t set up on this server yet. Ask your administrator to finish the setup.",
  },
  {
    test: /apply supabase\/migrations|supabase sql editor|table is missing|relation .* does not exist|not been migrated|run the latest (database )?migration/i,
    message: "This feature isn’t set up on the server yet. Ask your administrator to finish the setup, then try again.",
  },
  {
    test: /redis|rq worker|connection refused|econnrefused/i,
    message: "The test queue isn’t responding right now. Try again in a moment; if it keeps happening, contact your administrator.",
  },
  {
    test: /could not reach the api|failed to fetch|networkerror|is fastapi running|uvicorn/i,
    message: "Can’t reach the Attest server. Check your connection and try again.",
  },
  {
    test: /pytest|traceback \(most recent call last\)/i,
    message: "The test couldn’t be started. Try again; if it keeps happening, contact your administrator.",
  },
];

/** Friendly message → original operator message (most recent). */
const originals = new Map<string, string>();

/** Returns the end-user version of an error message (unchanged when it's already user-facing). */
export function friendlyErrorMessage(raw: string): string {
  const rule = RULES.find((item) => item.test.test(raw));
  if (!rule) return raw;
  originals.set(rule.message, raw);
  if (typeof console !== "undefined") console.warn("[Attest] Operator detail:", raw);
  return rule.message;
}

/** The original operator text behind a friendly message, if any (for the admin disclosure). */
export function operatorDetail(message: string | null | undefined): string | null {
  if (!message) return null;
  for (const [friendly, original] of originals) {
    if (message.includes(friendly)) return original;
  }
  return null;
}
