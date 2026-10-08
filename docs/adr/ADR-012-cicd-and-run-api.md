# ADR-012 — CI/CD through a public Run API and CLI

Status: Proposed. Supersedes ADR-006 when accepted.
Date: 2026-09-18
Depends on: ADR-005 (queue), ADR-008 (runner boundary)

## Context

ADR-006 accepted CI/CD as design-only: make runs API-driven with trigger metadata and runtime
environment overrides so GitHub, GitLab or Jenkins can trigger runs later without a redesign.
That leaves the actual shape open. This ADR fixes the shape so the MVP's internal run endpoint
is built as the thing CI will eventually call, rather than something CI has to work around.

The requirement that drives most of the design: a pipeline needs to run a suite against an
ephemeral preview deployment whose URL is not known until the pipeline runs, then block the
merge on the result.

## Decision

**One public, versioned Run API. Everything else is a wrapper over it.**

```
POST /api/v1/runs
  { suite_id | test_case_ids[],
    environment_id,
    overrides: { base_url },          <- preview deployments
    capabilities: { responsive: {viewport} },
    auth_profile_id,
    trigger: { source: "ci", provider, commit_sha, branch, pr_number, actor, ci_run_url },
    idempotency_key }
  -> 202 { run_id, status: "queued" }

GET  /api/v1/runs/{run_id}            -> status, step results, artifact links
POST /api/v1/runs/{run_id}/cancel
```

- **The API returns immediately.** A run is queued, never executed inline. This is ADR-008 applied
  to CI: a long pipeline step must not become a long HTTP request.
- **Waiting is the client's job.** The CLI drives the wait; the server never holds a connection
  for the length of a run. A **bounded long-poll** completion endpoint is permitted and preferred:
  `GET /api/v1/runs/{id}/completion?max_wait_seconds=30` blocks server-side for at most 30 seconds
  and returns `408` if the run is still going, and the client loops. That cuts poll traffic by an
  order of magnitude against a 5-second interval while preserving ADR-008's crash isolation.
  What remains forbidden is an unbounded synchronous run endpoint that returns only when the run
  finishes. Webhooks (ADR-017) are a latency improvement on top, never the gate.
- **Project-scoped API tokens**, not user sessions. Scopes `runs:create` and `runs:read`, shown
  once at creation, revocable, with last-used tracking. A CI token must not be able to edit test
  definitions, so a leaked pipeline token cannot rewrite the tests it runs.
- **`idempotency_key` is required for CI triggers.** A retried pipeline step returns the existing
  run instead of queueing a duplicate.
- **`overrides.base_url` is the preview-environment mechanism**, already anticipated by ADR-006.
  It overrides the Environment's URL for this run only and is recorded on the TestRun so the
  report shows what was actually tested. Restrict it to a per-project allowlist pattern; an
  unrestricted override lets a token holder point the platform's authenticated sessions at a
  host they control.
- **A thin CLI is the supported integration surface.**
  `testflow run --suite <id> --base-url <url> --wait --timeout 20m --junit results.xml`
  Exit codes: `0` passed, `1` test failures, `2` infrastructure or timeout. Distinguishing 1 from 2
  is what lets a team auto-retry infrastructure flakes without ignoring real failures.
- **JUnit XML is the reporting contract**, because every CI provider renders it natively. A
  Markdown summary for PR comments is a second reporter. No provider-specific result formats.
- **A GitHub Action and a GitHub App are different objects.** The Action is a wrapper around the
  CLI with no privileged access, and that holds for triggering. But GitHub restricts check-run
  writes to Apps, so posting a rich external check requires a separate, separately-installed
  GitHub App. Prefer the **detached check** model: the workflow job finishes as soon as the run is
  submitted, and the App posts an external check run that is the branch-protection gate. Document
  that the required check is the external check's name, not the workflow job, or teams will mark
  the wrong one required and gate on submission rather than on results. Commit statuses work with
  an ordinary token but cap at 1000 per sha and context, so use one context per suite, never one
  per test.
- **Any later provider integration is a wrapper around the CLI** with no
  private API access. If the Action needs an endpoint the CLI cannot reach, that is a defect in
  the API, not a reason for a special case.
- **CI runs carry a queue priority** distinct from interactive runs, so a large pipeline cannot
  starve a tester clicking Run, and vice versa.
- **Self-hosted runners** are the answer for targets not reachable from the platform's network.
  A runner registers with a project-scoped token and pulls jobs for that project only. Same queue
  contract, different deployment location. No change to the TestRun model.

## Alternatives considered

- **Native per-provider integrations first (a GitHub App, a Jenkins plugin).** Better UX per
  provider and far more surface to build and maintain, and it produces provider-shaped APIs that
  the next provider does not fit.
- **A synchronous run endpoint that returns the result.** Simple pipeline YAML, but it ties a
  multi-minute browser run to an HTTP connection and breaks ADR-008's crash isolation.
- **Export Playwright specs and let CI run them itself.** Cheap, and it abandons ADR-002: the
  structured definition stops being the source of truth the moment CI runs exported code, and
  results never come back to the platform.

## Status model (correction, Sep 2026)

The original `queued -> running -> passed | failed | cancelled | timed_out` progression is missing
an infrastructure-error state, and a single pass/fail boolean is not enough.

- Carry **`has_failures` and `has_errors` as separate booleans**. "The tests failed" and "we could
  not run the tests" are different events and a pipeline must act on them differently. ADR-004's
  "test not started" on auth failure is exactly this state without a name.
- Add an explicit **infrastructure error** status, distinct from `failed`, plus `queue_timeout`.
- Record whether a run **passed on its first attempt** or passed only after a retry, and put it on
  the TestRun row, not in the CLI. A surveyed product models this correctly in its API and then
  collapses it differently in each CI wrapper, so the same retry setting produces opposite merge
  outcomes depending on which integration a team uses. If retry policy lives in the wrapper and the
  run has one boolean, we ship that bug.

## Reject empty selections

`POST /api/v1/runs` that matches zero test cases returns **4xx, not 202**. A surveyed product
accepts a deployment event matching no plans, runs nothing, and exits zero, so a pipeline reports
green having tested nothing. Our request names `suite_id` or `test_case_ids[]` explicitly, which
makes this easy to enforce.

## Sharding

`idempotency_key` doubles as the shard join key. The first call mints the `run_id` and every
shard reports against it. Pass `expected_shards: N` and the server finalises when the Nth shard
reports, with no coordinator and no explicit finalise call; `-1` means unknown, and the client
finalises explicitly. **Ship a timeout for the never-finalised case from day one**, because a run
stuck waiting for a shard that died is a documented failure mode in at least two products.
Aggregation is server-side, since the backend is the system of record per ADR-008.

## Consequences

- The run endpoint the MVP builds for the UI **is** the CI endpoint. Building it as an internal
  convenience route and generalising later is the failure this ADR exists to prevent.
- New surfaces to own: token issuance and rotation, rate limiting, run quotas, and a versioned
  public contract that cannot be changed casually once a pipeline depends on it.
- Blocking a merge on a suite makes run **flakiness a delivery blocker**, not a QA annoyance.
  Retry policy and flake detection become prerequisites for recommending merge gating.
- Trigger metadata makes run history queryable by commit, branch and PR, which the reports UI
  should expose from the start rather than retrofit.
- Scheduled runs become a small addition later: an internal scheduler calling the same endpoint
  with `trigger.source = "schedule"`.
