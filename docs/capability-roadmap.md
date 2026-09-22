# Capability roadmap

Everything the MVP design deferred, what each one actually costs, and the order that costs least.
Source: `QA_E2E_Platform_MVP_Design_ADR_v4` sections 9 and 11. Sizing assumes
[ADR-010](adr/ADR-010-capability-extension-model.md) lands first.

## Why ADR-010 comes before any of these

Nine of the thirteen items below are additive once a capability registry exists, and are an
engine fork without one. Building the registry is not overhead ahead of the roadmap, it is what
converts the roadmap from thirteen forks into nine registrations. Responsive is already in MVP
scope and should be built as its reference implementation.

## The capabilities

| # | Capability | Reuses | Genuinely new | Size | Pull in |
|---|-----------|--------|---------------|------|---------|
| 1 | Storage / Cookies | Everything | 4 steps, 3 assertions | S | Wave 1 |
| 2 | Accessibility | Everything | 1 assertion, axe artifact, violations UI | S–M | Wave 1 |
| 3 | Network resilience | Everything | 5 steps, 2 assertions, HAR artifact | M | Wave 1 |
| 4 | CI/CD | Queue, runner | Public API, tokens, CLI, JUnit | M | Wave 2 |
| 5 | Cross-browser | Everything | Matrix run model, 2 runner images | M | Wave 2 |
| 6 | Scheduled runs | Run API | Scheduler service, cron UI | S–M | Wave 2 |
| 7 | Electron desktop | Locators, assertions, artifacts | Run target, app artifacts, runner image | M | Wave 3 |
| 8 | Multi-tab / window | Step executor | Window refs in the step schema | M | Wave 3 |
| 9 | Self-hosted runners | Queue contract | Registration, auth, network isolation | M–L | Wave 3 |
| 10 | Visual regression | Screenshots | Baselines, diff engine, approval workflow | L | Wave 4 |
| 11 | AI test generation | Structured model | Generation, grounding, review UX | L | Wave 4 |
| 12 | Real-device testing | TestRun contract | Device farm, no Playwright | XL | Not planned |
| 13 | Load / stress | Nothing much | Different tool and result model | XL | Not planned |

### 1. Storage / Cookies — S

Seed and assert `localStorage`, `sessionStorage` and cookies. Steps: set cookie, clear cookies,
set storage item, clear storage. Assertions: cookie equals, storage key present, storage value.
All of it is Playwright `BrowserContext` API. No new infrastructure.
Worth doing first because it is the cheapest real capability and it exercises the registry.
Watch: storage seeding overlaps auth profiles. Decide which owns session state before shipping.

### 2. Accessibility — S–M

`@axe-core/playwright`, one assertion type (`a11y.noViolations` with a rule and impact filter),
and a violations report artifact. The engineering is small. The **product** work is the report
UI: a raw axe dump is unusable, so violations need grouping by rule with element highlighting.
Watch: scoping by selector and a per-project rule baseline, or every legacy page fails forever.

### 3. Network resilience — M

Route interception, request mocking, abort and failure injection, offline mode, and throttling.
Steps: mock route, abort route, delay route, go offline, set throttle profile. Assertions:
request made, request not made, response status. HAR as an artifact.
Watch: interception is stateful across the run, so declaration order matters. Decide whether
mocks are steps in the Act phase or run configuration applied in Arrange. Arrange is the
better fit for the AAA model.

### 4. CI/CD — M

Fully designed in [ADR-012](adr/ADR-012-cicd-and-run-api.md). Public Run API, project tokens,
CLI with meaningful exit codes, JUnit output, base-URL override for preview deployments.
The important sequencing point: the MVP's own run endpoint should be built as this API, so
there is no migration later. That makes wave 2 a packaging exercise rather than a rewrite.
Watch: merge gating turns flakiness into a delivery blocker. Retry policy first.

### 5. Cross-browser (Firefox / WebKit) — M

Playwright supports both natively, so the executor barely changes. The cost is the **matrix**:
one Test Case producing several TestRuns, aggregated reporting, and deciding whether browser is
a run dimension like viewport or a separate case. Same model problem as running one test across
several viewports, so solve both at once.

### 6. Scheduled runs — S–M

A scheduler service calling the Run API with `trigger.source = "schedule"`. Needs cron config per
suite, a next-run/last-run view, and a policy for overlapping runs. Small once ADR-012 exists,
which is why it follows CI/CD rather than leading it.

### 7. Electron desktop — M

Fully designed in [ADR-011](adr/ADR-011-electron-desktop-testing.md). Run target union, app
artifacts pinned by digest, a `desktop` capability for window and main-process assertions, and a
separate runner image.
Watch: **no recorder support**. Desktop cases are hand-built until a recorder path exists, so do
not schedule this against users who expect the record-first workflow. Also: a Linux runner tests
the Linux build only.

### 8. Multi-tab / multi-window — M

Popups, `target=_blank`, OAuth flows that leave and return. Cheap in Playwright, invasive in the
model: every step needs an optional window reference, which touches the core step schema rather
than sitting in a capability. That makes it a core change with an ADR of its own.
Watch: it is a hard prerequisite for realistic SSO login flows, so auth work may pull it forward.

### 9. Self-hosted runners — M–L

For applications not reachable from the platform's network. The queue contract already allows it
per ADR-008. The work is runner registration, scoped credentials, version compatibility between
a customer-operated runner and the backend, and support for failures you cannot see.
Watch: the moment a runner runs outside your infrastructure, the schema-version check from
ADR-010 stops being a nicety.

### 10. Visual regression — L

Baseline screenshots, a diff engine, baseline storage, and an approval workflow so an intended
design change does not fail every test. The hard part is neither capture nor diffing, it is
**flakiness**: fonts, animations, scrollbars and GPU differences produce false positives that
destroy trust faster than no coverage at all. Needs pinned rendering in the runner image and
masking support before it is worth shipping.

### 11. AI test generation and self-healing — L

The structured model from ADR-002 is what makes this tractable: generate structured definitions,
not code. Two distinct features, and self-healing is the riskier one because a locator that
silently repairs itself can mask a real regression. Any healing must be surfaced and approved,
never silent. Explicitly out of scope in v4; keep it there until create-run-debug is reliable.

### 12. Real-device testing — XL, not planned

A device farm or a third-party cloud. Reuses the TestRun contract and essentially nothing else.
Buy rather than build if it is ever needed.

### 13. Load / stress — XL, not planned

A different tool (k6, Locust), a different result model, and different infrastructure. It shares
a name with testing and nothing else with this platform. Keep it out.

## Recommended sequence

1. **Finish the MVP checkpoint.** Nothing below is worth starting while the queue is a JSON file
   and the runner ignores which test it was asked to run.
2. **ADR-010 registry**, with Responsive migrated onto it as the reference implementation.
3. **Wave 1**: Storage/Cookies, Accessibility, Network. Three capabilities, no new infrastructure,
   and they prove the registry under real load.
4. **Wave 2**: CI/CD, cross-browser matrix, scheduled runs. This is where the platform starts
   displacing hand-written Playwright suites in other teams.
5. **Wave 3**: Electron, multi-tab, self-hosted runners. Each carries a genuine new boundary.
6. **Wave 4**: Visual regression, AI generation. Only once run reliability is not in question.

The guiding principle from v4 still holds: prove reliable create, run and debug before adding
more test categories.
