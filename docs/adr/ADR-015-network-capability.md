# ADR-015 — Network capability

Status: Proposed
Date: 2026-09-22
Depends on: ADR-010 (capability registry)

## Context

Testers need to verify how the application behaves when the network misbehaves: an API returns
500, a request never resolves, the connection drops mid-flow, a third-party script is slow. These
paths are where real production incidents live and they are nearly impossible to reproduce by
hand against a live backend.

Playwright provides all of it through request interception and CDP throttling. The design work is
not the mechanism, it is deciding where interception sits in the Arrange-Act-Assert model and how
to stop the capability from quietly turning end-to-end tests into mocked unit tests.

## Decision

Register a `network` capability contributing run configuration, steps, assertions and one
artifact.

**Route rules are run configuration, applied in Arrange, not steps in Act.**

This is the central decision. Interception is stateful: a route registered at step 4 silently
changes the meaning of steps 1 to 3 on a rerun, and ordering between overlapping patterns becomes
invisible in the step list. Instead the test case carries an ordered list of route rules applied
before the Act phase begins:

```
capabilities.network.routes: [
  { pattern: "**/api/checkout", method: "POST", action: "fulfill",
    status: 500, body: "...", contentType: "application/json" },
  { pattern: "**/analytics/**", action: "abort" },
  { pattern: "**/api/slow", action: "delay", ms: 5000 }
]
```

Actions: `fulfill` (mock a response), `abort` (fail the request), `delay` (slow it, then continue),
`continue` (pass through, used to scope a recording). First matching rule wins, and the editor
shows the order explicitly.

**Steps** exist only for changes that genuinely happen mid-scenario:

| Type | Arguments | Playwright |
|---|---|---|
| `network.goOffline` / `network.goOnline` | none | `context.setOffline` |
| `network.setThrottle` | profile (slow3g \| fast3g \| custom) | CDP `Network.emulateNetworkConditions` |
| `network.enableRule` / `network.disableRule` | rule id | toggles a declared rule |

A mid-test rule toggle references a rule declared in Arrange. Rules cannot be invented in Act.

**Assertions**

| Type | Arguments |
|---|---|
| `network.requestMade` | pattern, method, optional count |
| `network.requestNotMade` | pattern, method |
| `network.responseStatus` | pattern, expected status |
| `network.requestCount` | pattern, comparator, count |

**Artifact**: a HAR file for every run with the capability enabled, via
`context.recordHar`, attached to the TestRun and shown in the report's network tab.

## Guardrails

- **Mocking the application's own API makes a test not end to end.** The report must label a run
  that mocked first-party routes, and the suite view must show what proportion of a suite does so.
  A team that mocks its own backend everywhere has built integration tests with a browser
  attached, and should be able to see that happening.
- **Third-party aborts are the safe default.** Blocking analytics, ads and chat widgets reduces
  flakiness without weakening coverage. Ship a starter rule set for that and encourage it.
- **Mock bodies can contain secrets or personal data.** They are stored as test definition
  content, so they are subject to the same secret-reference rule as ADR-014 and are redacted in
  reports when secret-backed.
- **Throttling is emulation, not measurement.** Never present a throttled run's timings as
  performance data.

## Alternatives considered

- **Route rules as ordinary steps.** Fits the step model and hides ordering, breaks on rerun, and
  makes a route's scope depend on where a tester happened to drop it.
- **A proxy in front of the browser instead of in-page interception.** More faithful, and it adds
  a network component to the runner, complicates the container, and cannot see requests the
  service worker serves from cache.
- **Defer the capability and let testers use a staging backend with fault injection.** Realistic,
  and it makes every failure scenario depend on backend cooperation the QA team does not control.

## Consequences

- HAR files are large. They need a size cap, retention policy and object storage, which makes this
  the first capability to put real pressure on the artifact store.
- Service workers intercept before Playwright's routes in some cases. Document the limitation
  rather than pretending coverage is total.
- CDP throttling is Chromium-only. When cross-browser lands, throttling must degrade explicitly
  rather than silently doing nothing on another engine.
- Assertions need a request log captured for the whole run, not just from the moment an assertion
  executes. The capability therefore records from context creation.
