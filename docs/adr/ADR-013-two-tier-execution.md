# ADR-013 — Warm worker pool for interactive runs, ephemeral containers for CI

Status: Proposed
Date: 2026-09-18
Refines: ADR-005 (queue-controlled parallelism), ADR-008 (runner boundary)
Depends on: ADR-012 (trigger metadata)

## Context

ADR v4 treats warm and ephemeral execution as a **timeline**: "For MVP, a long-running runner
service with one isolated BrowserContext per test is sufficient. Later, execution can move to one
ephemeral container per run without changing the TestRun contract."

Read as a sequence, that guidance is ambiguous about the end state, and it was implemented
backwards. The current worker starts a Docker container per execution, which then runs
`npx playwright test`, which then launches Chromium. Every single-test run pays container start,
package resolution, Playwright boot and browser launch. No code path anywhere reuses a browser
process. The cheapest interactive action in the product is served by the most expensive
execution strategy available.

Warm and ephemeral are not two points in time. They are two answers to different questions, and
the product needs both permanently.

- A tester clicking Run, or replaying while authoring, needs **latency**. They are in a feedback
  loop and a sixty second wait breaks it.
- A pipeline running a whole suite to gate a merge needs **reproducibility and isolation**. It
  runs once, unattended, and nobody is watching the clock the same way.

## Decision

Two execution tiers behind one TestRun contract. The tier is selected by the platform from the
run's trigger, never by the caller.

| | Interactive tier | Batch tier |
|---|---|---|
| Trigger | `manual`, `replay` | `ci`, `schedule` |
| Deployment | Long-lived worker pool | Ephemeral container per run |
| Chromium | Warm process, reused | Launched once, discarded with the container |
| Isolation | Fresh `BrowserContext` per test | Fresh everything |
| Optimised for | Time to first result | Reproducibility |

Rules that keep the two tiers honest:

- **One executor, two deployments.** Both tiers run identical step-executor code against an
  identical pinned Playwright and browser version. The tier is an infrastructure choice, not a
  code path. If a test can pass in one tier and fail in the other, the tiers have diverged and
  that is a defect, not a configuration.
- **`BrowserContext` is the isolation boundary**, which is what makes warm reuse safe. This is
  already permitted by the starter guide: "Each run gets a fresh BrowserContext. A warm Chromium
  process may be reused locally for speed if isolation is preserved."
- **Warm processes are recycled** after a bounded number of runs, on any crash, and on idle
  timeout. A long-lived browser accumulates memory, service workers and leaked state. Treat the
  process as disposable even while it is warm.
- **The batch tier is the reference.** When a result is disputed, the containerised run is the
  authority, because it is the one a clean machine reproduces.
- **Tier is recorded on the TestRun** so a report can show how a result was produced.
- The interactive pool holds memory continuously, so it carries a max pool size and an idle
  scale-down. It is sized for concurrent testers, not for total test volume.

## Alternatives considered

- **Ephemeral containers for everything.** What exists today. Honest and reproducible, and it
  makes the authoring loop unusable. Container start alone exceeds the runtime of most single
  assertions.
- **Warm workers for everything.** Fast, and it makes CI results depend on how long a worker has
  been alive and what ran on it before. Unacceptable for a merge gate.
- **Let the caller choose the tier.** Tempting, and it turns an infrastructure decision into a
  public API commitment, and invites CI jobs to request the fast path and lose reproducibility.

## Consequences

- Interactive run latency becomes a tracked number with a target. Without one, the warm tier
  quietly degrades toward the cold path it was built to avoid.
- Two deployment shapes to operate, monitor and keep at the same version. Version skew between
  tiers is the main new failure mode and needs a startup check, per ADR-010.
- Warm-tier crash handling must return the worker to a known state rather than leaving a poisoned
  process serving later runs.
- The recorder and replay paths should use the interactive tier, which makes the warm pool a
  prerequisite for ADR-003 feeling usable rather than a later optimisation.
- Suite runs fan out to child runs per ADR-005 in both tiers. Fan-out concurrency is bounded by
  pool size interactively and by container limits in batch.
