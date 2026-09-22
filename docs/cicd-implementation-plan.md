# CI/CD integration — implementation plan

Owner: the lead. Status: proposed, 22 Sep 2026.
Decisions live in [ADR-012](adr/ADR-012-cicd-and-run-api.md) and
[ADR-017](adr/ADR-017-webhook-architecture.md). This is the sequence for building them.

Informed by a survey of nine E2E platforms: Checkly, Cypress Cloud, BrowserStack, Percy, Sauce
Labs, LambdaTest, mabl, Testim, and Playwright with GitHub Actions. Where a choice follows or
departs from what they all do, it says so.

## The shape everyone converged on

Across eight independent vendors the design is close to identical, which is a strong signal:

1. A **CLI is the canonical CI entry point**. One of nineteen documented integrations on one
   platform is a real plugin; the rest are CLI or script. Another deprecated its trigger API in
   favour of its CLI.
2. **Submit asynchronously, wait client-side**, with the wait as an explicit flag.
3. **JUnit XML is the report.** All nine. None support SARIF.
4. **A GitHub check is the gate**, via branch protection.
5. **A build id joins parallel shards** into one run. Present in all nine under six names.
6. **Webhooks are a side-channel nobody gates on.**

A trigger API exists only where the test definitions live in the vendor's cloud. That is our model
per ADR-002, so `POST /api/v1/runs` is required by our architecture rather than copied.

## Phase 0 — prerequisites, inside milestone 1

No separate work. These are constraints on what milestone 1 builds, and retrofitting them later
is the expensive path.

- The run endpoint milestone 1 builds **is** `POST /api/v1/runs`, versioned and public-shaped from
  the first commit. Not an internal convenience route to be generalised later.
- TestRun carries: `has_failures` and `has_errors` as separate booleans, an infrastructure-error
  status distinct from `failed`, `queue_timeout`, trigger provenance as a closed enum, and whether
  the run passed on its first attempt.
- Artifacts are records with their own retention, and we store bytes rather than a third-party
  link. One surveyed vendor's artifact URLs expire in 48 hours by default; a run record that
  outlives its own screenshots is useless for the failure triage this product exists to do.

## Phase 1 — the public Run API

**Deliver**

- `POST /api/v1/runs` with `suite_id` or `test_case_ids[]`, `environment_id`,
  `overrides.base_url`, `capabilities`, `auth_profile_id`, `trigger{}`, `idempotency_key`.
  Returns `202 { run_id, status }`.
- `GET /api/v1/runs/{id}`, `GET /api/v1/runs/{id}/completion?max_wait_seconds=30` returning `408`
  while running, `POST /api/v1/runs/{id}/cancel`.
- Project-scoped API tokens with `runs:create` and `runs:read`. A CI token must not be able to
  edit or quarantine a test definition. On one surveyed product the CI token can quarantine the
  very tests that constitute the gate.
- Token lifecycle: optional expiry of 1 to 365 days set at creation, warning emails at 7, 3, 1 and
  0 days, and **pause as a reversible soft-disable** before the irreversible delete. This follows
  the best model in the survey; the common alternative is an instant hard cutover.
- `overrides.base_url` restricted to a per-project allowlist pattern.
- Published rate limits and a `429` with `Retry-After`. One surveyed product documents 10 requests
  per second and 3,500 per hour; publishing a number lets a pipeline back off rather than guess.

**Why the allowlist is not optional.** Four surveyed products let a token holder point a run at
any URL with no domain check. For us that is a credential-exfiltration primitive: the runner
arrives at an attacker-controlled host with a decrypted `storageState` attached and sends the
session cookie. This is the single highest-severity finding in the research.

**Acceptance.** A run triggered by `curl` with a scoped token executes and reports. The same call
with the same idempotency key returns the same run rather than queueing a second. A request
matching zero test cases returns 4xx, never 202.

## Phase 2 — the CLI

**Deliver**

```
testflow run --suite <id> --base-url <url> --wait --timeout 20m --junit results.xml
```

- Exit codes: `0` passed, `1` test failures, `2` infrastructure error or timeout.
- `--wait` drives the bounded long-poll. Without it, print the run id and exit 0.
- JUnit XML output. A Markdown summary for PR comments.
- **Secret and non-secret inputs are different flags.** Values passed for interpolation land in
  run metadata and are not secret; credentials go through a separate flag that scopes them to the
  single run and never reaches metadata or logs. One surveyed CLI makes exactly this split and it
  is the right shape.
- **Ship the binary signed**, with a detached signature and published public key so a pipeline can
  verify what it just downloaded. One surveyed vendor does this and it costs almost nothing.
- Detect CI from the environment and suppress verbose logging by default. One vendor documents
  their own output overwhelming CI systems.

**The exit-code split is a genuine differentiator.** Eight of nine surveyed products collapse
infrastructure failure into test failure as exit `1`, and one requires grepping stderr to tell
them apart. One product's default exit code is the *number* of failing tests, which means a run
with exactly 256 failures exits 0 after the shell's modulo. Distinguishing 1 from 2 is what lets a
team auto-retry infrastructure flakes without ignoring real failures, and it costs nothing.

**Acceptance.** A pipeline fails on test failure, retries on infrastructure error, and the CI
provider renders the JUnit results natively.

**A CLI flag that skips the wait must not exit 0 on unknown results.** One surveyed CLI's async
mode collects jobs that are still running, treats not-yet-failed as passed, exits 0, and silently
disables its own report writers. Our `--wait`-less mode prints the run id and exits 0 only because
it explicitly makes no claim about the outcome, and the documentation says so.

## Preview environments — consider DNS remapping, not just base URL

The obvious mechanism is `overrides.base_url`, and it is in phase 1. But one surveyed product
offers something better for the per-pull-request case: a host override applied at the execution
VM's resolver, so tests keep production hostnames and the pipeline repoints those names at the
preview deployment with no change to any test definition.

That fits our Environment model better than threading a base URL through every test, and it solves
cases a base URL cannot, such as an app that calls a second hostname for its API. It also narrows
the exfiltration surface from phase 1: a resolver override maps a named host to an address, rather
than letting a caller substitute an arbitrary URL.

Not committed for v1. Worth a spike before phase 3, because if we want it, the Environment model
should carry host mappings from the start rather than gaining them later.

## Phase 3 — GitHub

**Deliver**

- A GitHub Action that is a thin wrapper over the CLI, inputs mapping to flags. No private API.
- A **separate** GitHub App for check runs, since GitHub restricts check writes to Apps.
- Detached check mode: the workflow job returns once the run is submitted, and the App posts the
  external check that branch protection requires.

**Two documented ways this blocks merges forever.** A workflow skipped by a path filter leaves the
required check pending, and marking the workflow job required rather than the external check gates
on submission instead of results. Both need to be in our setup documentation, not discovered.

**Acceptance.** A pull request against a preview deployment gets a check that turns green or red
on real results, and a skipped workflow does not wedge the queue.

## Phase 4 — webhooks

Built to [ADR-017](adr/ADR-017-webhook-architecture.md). Signing over timestamp and body, dual
secrets for zero-downtime rotation, 10 retries, a delivery log showing every attempt, manual
redelivery preserving the event id, and per-delivery destination validation.

Five of nine surveyed products sign nothing. Only one documents replay protection. Shipping this
properly puts us ahead of every incumbent on the most security-sensitive surface in the product,
which matters because our payloads announce runs that touched decrypted session state.

**Acceptance.** A receiver built only from our published documentation verifies a signature,
survives a redelivery without double-processing, and a rotation completes with no missed delivery.

## Phase 5 — merge gating that survives flaky tests

Cheap, needs no engine work, and absent from six of the nine surveyed products.

- **Test case status**: `draft | evaluating | active | quarantined`. An `evaluating` test runs and
  reports failures but cannot fail the build, which is how a team adds tests to CI gradually.
- **Quarantine keeps the test running** and excludes it from the verdict. It never stops execution.
  One product's canonical path implements muting as "the test no longer runs", with no expiry and
  no reminder, and its own documentation admits mutes hide real regressions.
- **Every quarantine carries a mandatory expiry or review date.** Every product that shipped it
  without one documents regretting it.
- **Flake definition with an exit condition**: flaky means passed after a retry, and a test stops
  being flaky only after a set number of consecutive clean runs. A twenty percent flake rate over
  a sliding ten-run window is reasonable prior art.
- **Report a quarantined-or-flaky-only failure as a `neutral` GitHub check.** GitHub documents
  `neutral` as not blocking merges. No product in the survey uses this, and it is the mechanism
  that lets a team gate on tests without a flaky suite holding releases hostage.
- Put the gating buckets **in the payload**: `passed`, `failed`, `failed_evaluating`, `evaluating`,
  `quarantined`, `skipped`. A consumer that receives these cannot mis-apply the gate.

## Sequencing

Phase 0 is inside milestone 1. Phases 1 and 2 are the minimum useful CI/CD story and should ship
together. Phase 3 is what makes it feel native. Phase 4 is an optimisation. Phase 5 is what stops
teams turning the gate off three months in, and is worth more than it costs.

Nothing here starts before milestone 1 passes. A CI integration on top of a runner that does not
execute the requested test would industrialise a false green.
