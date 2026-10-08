/**
 * Turns raw run failure messages (Playwright errors, setup problems) into a
 * short sentence a tester can act on. Keep the raw message available in a
 * tooltip or "Details" disclosure.
 */
export function friendlyRunError(message: string | null | undefined): string {
  const raw = (message ?? "").trim();
  if (!raw) return "";

  const timeout = raw.match(/timeout\s*(\d+)\s*ms exceeded/i) ?? raw.match(/timed out after\s*(\d+)\s*ms/i);
  if (timeout) {
    const seconds = Math.round(Number(timeout[1]) / 1000);
    const element = /locator|waiting for|selector|element/i.test(raw);
    return element ? `Timed out waiting for an element (${seconds} s)` : `Timed out after ${seconds} s`;
  }

  const expected = raw.match(/expected text not found:\s*["“]?(.+?)["”]?(?:\.|$)/i);
  if (expected) return `Expected text “${expected[1].trim()}” wasn’t on the page`;

  if (/auth(entication|enticated)? (session|profile)|storage_?state|session file|record the login|login (flow|session)/i.test(raw)) {
    return "Couldn’t sign in with the auth profile. Record the login again.";
  }

  if (/column .* does not exist|relation .* does not exist|table is missing|migration|internal server error|traceback|keyerror|attributeerror|test not started/i.test(raw)) {
    return "Couldn’t start the test (setup problem)";
  }

  if (/net::err_|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION/i.test(raw)) return "Couldn’t reach the site under test";

  const firstSentence = raw.split(/(?<=[.!?])\s|\n/)[0] ?? raw;
  return firstSentence.length > 120 ? `${firstSentence.slice(0, 117)}…` : firstSentence;
}
