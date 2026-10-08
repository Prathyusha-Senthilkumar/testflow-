# ADR-014 — Storage and Cookies capability

Status: Proposed
Date: 2026-09-22
Depends on: ADR-010 (capability registry), ADR-004 (auth profiles)

## Context

Testers need to seed and assert browser state that is not visible in the DOM: cookies,
`localStorage` and `sessionStorage`. Typical cases are dismissing a consent banner by seeding
its cookie, putting the app into a feature-flag state, and asserting that logout actually
clears the session.

This is the cheapest capability in `capability-roadmap.md`, which makes it the right one to
build first. It is entirely Playwright `BrowserContext` API and needs no new infrastructure.
Its real value is proving the ADR-010 registry under a genuine second capability.

## Decision

Register a `storage` capability contributing steps, assertions and no new artifacts.

**Steps**

| Type | Arguments | Playwright |
|---|---|---|
| `storage.setCookie` | name, value, domain, path, expires, httpOnly, secure, sameSite | `context.addCookies` |
| `storage.clearCookies` | optional name filter | `context.clearCookies` |
| `storage.setItem` | area (local\|session), key, value | `page.evaluate` |
| `storage.removeItem` | area, key | `page.evaluate` |
| `storage.clearArea` | area | `page.evaluate` |

**Assertions**

| Type | Arguments |
|---|---|
| `storage.cookieEquals` | name, expected value |
| `storage.cookieExists` / `storage.cookieAbsent` | name |
| `storage.itemEquals` | area, key, expected value |
| `storage.itemExists` / `storage.itemAbsent` | area, key |

Rules:

- **Seeding belongs in Arrange, assertions in Assert.** A `storage.set*` step in the Act phase is
  almost always the test faking the state it should have produced. Warn on it in the editor.
- **Cookie values can be secrets.** A definition stores either a literal or a secret reference
  resolved by the runner at execution time. A literal that looks like a token, for example a
  JWT-shaped string, is rejected at validation with a message pointing at secret references.
  Secret-backed values are redacted in the run report.
- **Storage operations need an origin.** `localStorage` is origin-scoped, so a `setItem` step
  before any navigation has no meaningful target. Validation requires a preceding navigate step,
  or an explicit origin argument.

## Boundary with auth profiles

Auth profiles (ADR-004) own **session identity**: the whole `storageState` blob, restored and
refreshed as one unit. The storage capability owns **individual, test-specific values**.

The line: if a value decides *who the user is*, it belongs to the auth profile. If it decides
*what state the app is in* for one scenario, it belongs to the storage capability. A test may use
both, and the auth profile is always applied first so a step can deliberately override one key.

Do not let the storage capability become a second way to log in. That path ends with credentials
pasted into test definitions, which ADR-004 exists to prevent.

## Alternatives considered

- **Fold this into auth profiles.** Conflates identity with scenario state and gives no home for
  assertions, which are most of the value.
- **Expose a generic "run JavaScript" step instead.** One step covers every case and every future
  case, and it destroys the structured model from ADR-002: the platform can no longer show,
  validate, edit or reason about what a test does.

## Consequences

- First real test of the registry. If adding this touches the step executor's core dispatch, the
  ADR-010 seam is wrong and should be fixed before Network lands.
- The editor needs a key-value form generated from the registry schema rather than a bespoke UI,
  otherwise every later capability pays for its own form.
- Cookie assertions are timing-sensitive, since a cookie set by a response arrives asynchronously.
  Assertions need the same auto-retry treatment as DOM assertions.
