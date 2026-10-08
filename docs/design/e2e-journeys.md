# E2E Journeys (chained test cases): design

## 1. Status

| | |
|---|---|
| Status | **Proposed. Not scheduled.** |
| Owner | TBD |
| Date | 8 Oct 2026 |
| Constrained by | ADR-002 (structured definition is source of truth), ADR-004 / ADR-018 (auth profiles and sign-in), ADR-005 (queue-controlled parallelism), ADR-007 (story dependencies are not test dependencies), ADR-008 (FastAPI never launches a browser), ADR-010 (capability registry), ADR-012 (public Run API), ADR-013 (warm pool vs ephemeral tiers) |
| Scope note | ADR-007 names "E2E Journey" as a separate, future concept. This doc designs that concept. Nothing here changes how test cases or suites behave today. |

## 2. Problem, goals, non-goals

**Problem.** Testers want to check flows that cross features and roles, for example Evolv's *Create assessment → Publish it → Assign to cohort → Learner takes it → Admin sees the result*. Today the only way to do that is one huge test case that records everything. That test is slow to author, hard to debug, can't switch identity halfway, and duplicates steps that already exist as smaller test cases. The other option is a suite whose cases quietly depend on each other's data. ADR-007 forbids that, and it breaks anyway: `ExecutionService._start_batch` (`backend/app/services/execution_service.py:449`) fans a suite out to one Redis job per case, and up to `WORKER_CONCURRENCY` slots (`worker/src/index.ts:37`) run them in parallel in any order.

**Goals**

1. Run an **ordered** chain of existing, published test cases as one flow. Later steps can rely on state that earlier steps created.
2. Pass data between steps, such as an id captured in step 1 and used in step 3.
3. Switch identity mid-flow (admin → learner → admin) using auth profiles.
4. Give clear failure attribution: which step failed, and which steps were blocked by it.
5. Use the same TestRun contract, runner, artifacts and Run API as everything else. A journey is not a second engine.

**Non-goals**

- **Making ordinary suites order-dependent.** Suites stay unordered, independent and parallel. There is no "run in order" toggle on a suite.
- Weakening test case independence. A test case referenced by a journey must still be runnable on its own (section 3.1).
- Branching, loops or conditionals inside a journey. A journey is a straight line in v1.
- Cross-project journeys, or journeys that span several browsers at once (two users acting at the same time).
- Running journey steps in FastAPI, or any new execution engine.

## 3. Concepts

### 3.1 Journey and steps

A **Journey** belongs to a project and has a name, a description, an optional User Story link, a default environment and a default auth profile. Its body is an **ordered list of steps**:

| Step kind | What it references | Notes |
|---|---|---|
| `test_case` | `test_case_id` + **pinned** `test_case_version` (a row in `test_case_versions`) | The normal case. It reuses an existing, independently runnable test. |
| `inline` | A step group stored on the journey (structured steps plus assertions) | For glue that only makes sense mid-journey, such as "open the assessment link from the previous step". It belongs to the journey and is not a test case, so ADR-007 is not bent. |
| `setup` / `teardown` | Either of the above, marked by role | Setup runs first. Teardown runs **always**, including after a failure or a cancel (3.5). |

**Independence rule (keeps ADR-007 intact).** A referenced test case can declare **inputs** (`{{assessmentId}}`), but every input must have a default or be produced by that case's own Arrange. The journey only overrides inputs; it never supplies something the case can't run without. A step that can't run alone belongs in an `inline` group, not in a test case. The backend enforces this when a step is saved.

### 3.2 Data passing (variables)

- **Outputs.** A step declares captures, which run after the step passes:
  - `url` + regex, e.g. `/assessments/(?<assessmentId>[0-9a-f-]+)`
  - `text` of a locator, optionally with a regex
  - `attribute` of a locator
  - `value` of an input
- **Inputs.** A step maps its declared inputs to expressions: `{{steps.1.assessmentId}}`, `{{journey.cohortName}}`, a literal, or a built-in.
- **Built-ins:**
  - `{{run.id}}`
  - `{{run.prefix}}` (`ATTEST-<6 chars>`, unique per journey run; see 3.5 and risks)
  - `{{env.baseUrl}}`
  - `{{now.iso}}`
  - `{{random.slug}}`
- **Syntax.** This reuses the `{{name}}` placeholder syntax ADR-018 proposes for recorded login flows (ADR-018 section 2c), so the platform ends up with one placeholder language.
- **Validation is static.** It happens at save time and again at run start in the backend (ADR-010 style). A reference to a step that comes later, or to an output that doesn't exist, is a 400 error, not a runtime surprise.
- **Secrets.** Any variable can be flagged `secret`. Captures from `input[type=password]` are secret automatically. Section 4.4 covers how secrets are handled.

### 3.3 Shared vs fresh browser state

| Mode | What it means | Pros | Cons |
|---|---|---|---|
| **Shared context** | One `BrowserContext` (and page) carries over from step to step | Matches a real user. SPA state, sessionStorage and the open page carry over. Fast, with no re-login or re-navigation. | Leaked state can hide bugs. A failed step leaves the page in an unknown state for the next one. |
| **Fresh context per step** | Each step gets a new context, the same as a standalone run today (`runTest.ts:210-213`) | Steps are isolated and results look like a standalone run | Every step pays for sign-in and navigation. In-memory and sessionStorage handoff is lost, so data can only pass through variables. |
| **Context per identity** (recommended default) | One context per auth profile used in the journey, created on first use and kept for the whole journey. Steps with the same profile share it. | Switching admin → learner → admin works naturally: the admin tab is still where admin left it. Identities never share cookies. | More than one context is open in one slot (bounded by the number of distinct profiles, at most 3) |

**Recommendation.** Use **context per identity** as the default, with a per-step `fresh_context: true` override. The **MVP is one shared context**, because the MVP allows a single auth profile per journey, and in that case context per identity *is* a single shared context. The model is therefore forward compatible.

### 3.4 Auth switching

- Each step can override `auth_profile_id`. Otherwise it inherits the journey default.
- The first time a profile is used, the runner runs the ADR-004/ADR-018 sequence (restore → validate → refresh → sign in → save) through `ensureAuthenticatedSession` (`worker/src/authProfiles.ts:171`) and creates that identity's context.
- If sign-in fails, the step's status is **"Not started: <ADR-018 message>"**, the journey ends with `error` (`has_errors`, ADR-012), and the remaining steps become Skipped.
- ADR-018's per-profile sign-in lock applies unchanged.

### 3.5 Setup, teardown and cleanup

- **Setup** steps run before the main steps. If a setup step fails, the journey is `error` ("could not arrange"), not `failed`.
- **Teardown** steps always run: after a pass, a failure, a timeout or a cancel. They get their own budget (default 60 s total) and run with the variables captured so far. Teardown should be written to tolerate missing data, for example "delete the assessment `{{steps.1.assessmentId}}` if it is set".
- A teardown failure is recorded on its step and sets a `cleanup_failed` flag on the journey run. It never turns a failed journey into a passed one, or the reverse.
- If the runner crashes, teardown does not run. That is why `{{run.prefix}}` exists: a scheduled sweep can delete `ATTEST-*` data that is older than N hours (section 10).

### 3.6 Failure semantics

- **Default: stop on first failure.** Every later main step becomes **Skipped, "Blocked by step N"**. Teardown still runs.
- A step can set `continue_on_fail: true`. Use it for checks that don't produce anything later steps need, such as "the admin dashboard shows a banner". If a later step reads an output from a failed step, that later step is Skipped as blocked, whatever the flag says.
- The journey fails if any step failed. It ends as `error` if a setup step, sign-in or infrastructure failed.

### 3.7 Retries

- Per step: `retries` from 0 to 2. The default is 0, and the hard cap is 2.
- A retry re-runs **only that step** in the **same** context. Earlier steps are never re-run, because their side effects already happened.
- Each attempt is its own child `test_runs` row with an `attempt` number. Following ADR-012, the journey run records `passed_first_attempt`.
- Retries are off for steps that create data unless the tester opts in. A retried "Create assessment" can leave two assessments behind.

### 3.8 Timeouts

| Budget | Default | Source |
|---|---|---|
| Step action/navigation | 30 s | `STEP_TIMEOUT_MS` (`worker/src/index.ts:39`) |
| Step (test) | 5 min | `TEST_TIMEOUT_MS` (`index.ts:38`), overridable per step |
| Journey | 20 min, hard cap 60 min | new `JOURNEY_TIMEOUT_MS`. Set per journey, validated against the cap. |
| Teardown | 60 s total | separate from the journey budget, so a timeout can still clean up |

A journey timeout ends the current step as `timed_out`, skips the remaining main steps, then runs teardown.

## 4. How it differs from suites

| | Suite | Journey |
|---|---|---|
| Order | Unordered | Ordered, explicit position |
| Dependency | Cases are independent (ADR-007) | Later steps depend on earlier ones, but only inside the journey |
| Execution | One queue job per case, parallel across slots (ADR-005) | One queue job per journey run, sequential, **one runner slot** |
| Browser state | Fresh context per case | Context per identity, shared across steps |
| Data | None shared | Variables passed between steps |
| Failure | Each case passes or fails alone | Stop on first failure. Downstream steps are Skipped as blocked. |
| Result | Batch aggregate of child TestRuns | Journey run plus child TestRuns, with `step_index` |
| Typical use | Regression coverage | Cross-role business flows, smoke of critical paths |

## 5. Execution design

### 5.1 One job per journey run (recommended)

**Decision.** One journey run is **one queue job**. A single runner slot claims it and runs every step in order, holding the identity contexts for the whole run.

The alternative is one job per step with a handoff between them. It is rejected because:

- **Browser state can't be handed off.** You can serialize `storageState` but not the open page, sessionStorage, in-memory SPA state or an in-progress form. Handoff would quietly force "fresh context per step", which defeats the reason journeys exist.
- **Latency.** Every step would pay for a queue round trip and context setup, and possibly a different worker with a cold context.
- **Coordination.** Another component would have to enqueue step N+1 when step N finishes, with its own crash recovery. This is the stuck-message class of bug that `batch_queue.reclaim_recent_unstarted` (`backend/app/services/batch_queue.py:107`) already patches for batches.

What it costs: a long journey holds one slot for its whole duration. That is managed in 5.2.

**Flow**

```
UI / CLI ──POST /api/v1/runs {journey_id,…}──▶ FastAPI JourneyRunService
   validate refs, versions, variables, auth profiles; reject empty journeys (ADR-012)
   insert journey_runs(status=queued, definition_snapshot, run_prefix)
   insert child test_runs(status=Queued, journey_run_id, step_index) for every step
   enqueue { id: job_id, kind: "journey", journeyRunId }  ──▶ Redis testflow:journey-queue
Runner slot (journey consumer) ──claim──▶ fetch definition snapshot ──▶ for each step:
   ensure identity context → resolve inputs → run step → capture outputs → write child run
   → stop / continue → teardown → finish journey_runs (idempotent, conditional on status)
```

### 5.2 Runner changes (`worker/src`)

- **Separate queue key, bounded slots.** Add `testflow:journey-queue` with `JOURNEY_CONCURRENCY` consumers (default 1). Those consumers count against `WORKER_CONCURRENCY`, so with the default of 3, at least 2 slots are always free for single and suite runs. `claimNext` uses BLMOVE on one list (`index.ts:87`) and can't skip job types, so a second list is simpler than filtering.
- **`runJourney.ts`** wraps today's `runRecordedTest` (`runTest.ts:59`). The step executor is factored out of it so a step runs against a context it's *given*, instead of creating and closing its own context (`runTest.ts:209-213, 277`). This keeps one executor for both standalone and journey runs, which matches ADR-013's "one executor" rule.
- **Pinned versions.** Today the runner reads the *current* script from `configPath` on disk (`runTest.ts:60-80`). A journey must run the pinned `test_case_versions.snapshot.scriptSnapshot` (written by `TestCasesService.publish`, `backend/app/services/test_cases_service.py:161`). This is a prerequisite PR. It also helps reruns.
- **Warm pool.** Identity contexts come from `pool.acquireContext` (`browserPool.ts`). `needsRecycle()` is only checked between jobs (`index.ts:121`), so a journey is never recycled mid-run. A journey counts as N steps towards `BROWSER_RECYCLE_AFTER_TESTS`.
- **Leases and crash recovery.**
  - The lease is per worker (`heartbeat`), not per job, so a long journey doesn't need lease extensions.
  - The orphan reaper must **not** requeue a journey (`MAX_RECOVERIES = 1`, `jobStore.ts:13`). Re-running from step 1 against half-created data does more harm than good.
  - A reaped journey is marked `error`: "Runner lost during step N". Its running child run is Failed with the same message, and the rest are Skipped.
  - The `run_sweep_service` gets the same rule for `journey_runs`.
- **Graceful shutdown.** A journey can't be handed back mid-run the way `release()` hands back a single job (`index.ts:154-160`). On SIGTERM, the current step may finish within `SHUTDOWN_GRACE_MS`, then teardown runs, and the journey ends as `error` ("Runner shut down"). Setting `stopping` keeps new journeys from being claimed.
- **Cancellation.** It reuses `request_cancel` (`backend/app/queue/job_store.py:121`) and the existing one-second `isCancelled` poll (`runTest.ts:105`). Cancel closes the current step's page action, marks that step cancelled and the remaining steps Skipped ("Cancelled"), runs teardown with its own budget, then marks the journey `cancelled`.
- **Slot visibility.** `SlotJob` (`workerStatus.ts:12`) gains `journeyRunId`, `journeyName`, `stepIndex` and `stepCount`. These are ids, a name and counters only, which keeps the slot tracker's "no payloads" rule.
- **Tier (ADR-013).** A manual journey runs on the warm tier. A CI-triggered journey runs on the batch tier, in one container per journey run.

### 5.3 Persistence

`journey_runs` and child `test_runs` live in **Supabase from day one**. Do not copy the batch pattern, where batch state is a JSON document under `testflow:batch:<id>` in Redis (`execution_service.py:888-928`). CLAUDE.md requires runs to be persisted in Supabase, and Redis keys expire after 48 h (`JOB_TTL_SECONDS`).

### 5.4 Variables and secrets

- Captured values are written to `journey_run_variables` as each step finishes, so a crash keeps what was captured and the run view can show it.
  - Non-secret values are stored as plain text.
  - Secret values are encrypted with Fernet under `TESTFLOW_SECRET_KEY`, the same scheme as `auth_profiles.*_enc` (`docs/AUTH_PROFILE_REKEY.md`). They are never returned by the API. The UI shows `••••` and the name only.
- **Logs.**
  - The runner logs `event=journey_var_captured run=… step=… name=assessmentId secret=false`. It never logs the value when `secret=true`, and never logs auth state.
  - Resolved inputs are substituted in memory and never written into the job payload, which stays `{ id, kind, journeyRunId }` per ADR-005/008.
- **Screenshots.**
  - Step screenshots (`startStepShots`, `runTest.ts:285`) pass Playwright's `mask` option. It covers `input[type=password]` and the locators of every field that was filled from a secret variable.
  - Text that a page *echoes back* can't be masked reliably in pixels, so secrets should be credentials, not data the app displays. This limit is documented in the builder.
- **Traces.** Playwright traces record fill values. When trace capture lands, steps that use a secret variable must turn off trace snapshots for those actions, or the trace is not kept.

## 6. Data model and migration sketch

Migration `supabase/migrations/2026MMDD_journeys.sql`. It is additive, with UUID ids, `created_at`/`updated_at` on every table, and relationship columns indexed. Following CLAUDE.md, relationship columns are **conceptual references, not DB FKs**, so `JourneyService` validates them.

```sql
create table journeys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,               -- conceptual ref, indexed
  name text not null, description text,
  user_story_id uuid,                     -- optional
  default_environment_id uuid, default_auth_profile_id text,  -- auth_profiles.id is text today
  journey_timeout_ms integer not null default 1200000,
  variables jsonb not null default '[]',  -- journey-level inputs: [{name, default, secret}]
  version integer not null default 1,     -- bumped on every saved edit
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table journey_steps (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null, position integer not null,
  role text not null default 'main' check (role in ('setup','main','teardown')),
  kind text not null check (kind in ('test_case','inline')),
  test_case_id uuid, test_case_version integer,   -- required when kind='test_case'
  inline_definition jsonb,                        -- required when kind='inline'
  auth_profile_id text,                           -- null = inherit
  fresh_context boolean not null default false,
  inputs jsonb not null default '{}',             -- {"assessmentId": "{{steps.1.assessmentId}}"}
  outputs jsonb not null default '[]',            -- [{name, source:'url'|'text'|..., locator?, regex?, secret}]
  continue_on_fail boolean not null default false,
  retries smallint not null default 0 check (retries between 0 and 2),
  timeout_ms integer,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (journey_id, position)
);

create table journey_runs (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null, project_id uuid not null, journey_version integer not null,
  status text not null check (status in
    ('queued','running','passed','failed','cancelled','timed_out','error')),
  has_failures boolean not null default false, has_errors boolean not null default false,
  passed_first_attempt boolean, cleanup_failed boolean not null default false,
  environment_id uuid, base_url text,             -- resolved, incl. overrides.base_url
  trigger jsonb not null,                         -- ADR-012 trigger metadata
  idempotency_key text, run_prefix text not null, job_id text,
  current_step integer, failed_step integer, error_message text,
  definition_snapshot jsonb not null,             -- steps + pinned versions, frozen at start
  worker_id text, run_by uuid,
  queued_at timestamptz default now(), started_at timestamptz, completed_at timestamptz,
  duration_ms integer, created_at timestamptz default now(), updated_at timestamptz default now()
);

create table journey_run_variables (
  journey_run_id uuid not null, step_index integer not null, name text not null,
  value text, value_enc text, secret boolean not null default false,
  created_at timestamptz default now(), primary key (journey_run_id, name)
);

alter table test_runs add column journey_run_id uuid, add column step_index integer,
  add column attempt smallint not null default 1, add column blocked_by_step integer;
-- add 'Skipped' to test_runs_status_check (today: Queued, Running, Passed, Failed, Not Run)
-- indexes: journeys(project_id), journey_steps(journey_id, position), journey_steps(test_case_id),
--          journey_runs(journey_id, queued_at desc), journey_runs(project_id, status),
--          unique journey_runs(project_id, idempotency_key) where idempotency_key is not null,
--          test_runs(journey_run_id, step_index)
```

**Immutability**

- A `journey_runs` row is immutable once it reaches a terminal status. The only later changes allowed are artifact and metadata updates, such as `cleanup_failed` set by the sweep.
- `definition_snapshot` freezes the steps and pinned versions at start, so later edits to the journey never change how a past run reads.
- Child `test_runs` follow the existing rule: workers only write while the status is in `Queued`/`Running` (`worker/src/runs.ts:5, 17-35`).

**Orphan handling and version drift**

- **Pinning.** Only *published* test cases can be referenced (`published_version ≥ 1`). The step stores `test_case_version`. Edits to the case don't affect the journey until someone clicks "Update pin". The builder shows drift as "v4 pinned · v6 available".
- **Deleting a referenced test case.** `test_case_versions` cascades on delete (`002_phase1_persistence.sql:41-47`), so deleting a case would destroy the pinned snapshot. `TestCasesService.delete` therefore returns **409** "Used by 2 journeys: …" with links. Deleting it anyway requires removing the step first. Past runs stay readable because `definition_snapshot` holds names and versions.
- **Deleted auth profile or environment.** Run-start validation fails with 400, naming the step. The journey is shown as "Needs attention" in the list.
- **Deleting a journey** deletes its steps. Its runs and child `test_runs` are kept as history, and the journey name is kept in the snapshot.

**Side effects on existing views (must ship in the same migration)**

- `project_overview` and the test case "last status" lateral joins (`supabase/schema.sql`, `001_suite_case_many_to_many.sql:61,78`) must filter on `journey_run_id is null`. A step that ran with injected state is not the case's standalone status.
- The notifications trigger (`20261008_notifications.sql:225`) must skip child rows, or a 5-step journey sends 5 notifications. Add one journey-level notification on terminal `journey_runs.status`.

## 7. API sketch

Routes follow the existing layout. Each new route file uses router → service → repository: `JourneyService`, `JourneyRunService`, `JourneyRepository`, `JourneyRunRepository`. Errors are returned as `{ "message": … }`.

```
GET    /api/projects/{pid}/journeys                         list (+ last run status, pass rate)
POST   /api/projects/{pid}/journeys                         create
GET    /api/projects/{pid}/journeys/{jid}                   detail incl. steps, drift info
PUT    /api/projects/{pid}/journeys/{jid}                   replace steps atomically (bumps version)
DELETE /api/projects/{pid}/journeys/{jid}
POST   /api/projects/{pid}/journeys/{jid}/validate          static checks without running

POST   /api/v1/runs   { journey_id, environment_id, overrides:{base_url}, inputs:{…},
                        trigger:{source,…}, idempotency_key }   -> 202 { run_id, kind:"journey", status:"queued" }
GET    /api/v1/runs/{run_id}                                kind:"journey": status, steps[] with child
                                                            run ids, durations, blocked_by, masked variables
GET    /api/v1/runs/{run_id}/completion?max_wait_seconds=30 ADR-012 bounded long-poll
POST   /api/v1/runs/{run_id}/cancel
POST   /api/v1/runs/{run_id}/rerun                          new journey run, new run_prefix
GET    /api/projects/{pid}/journeys/{jid}/runs?cursor=…     history
```

- **One Run API.** The journey run is a run *kind* on ADR-012's endpoint, not a separate API, so the CLI and CI wrappers get journeys for free. `testflow run --journey <id> --base-url … --wait` works the same as `--suite`.
- **Exit codes.** `failed` maps to exit 1. `error` and `timed_out` map to 2.
- **Validation.**
  - A journey with zero main steps returns 400 ("Reject empty selections").
  - `overrides.base_url` must match the project allowlist.
  - `inputs` may only name declared journey variables.
- **Interim.** Until `/api/v1/runs` exists, the same service method sits behind a project-scoped `POST /api/projects/{pid}/journeys/{jid}/runs`. It is retired when v1 lands.

## 8. UI/UX sketch

**Navigation.** Add `Journeys` (lucide `Route`) to `projectNav` (`frontend/src/components/layout/nav-items.ts`), right after Suites. New routes:

- `projects/[id]/journeys` (list)
- `projects/[id]/journeys/[journeyId]` (builder, plus a Runs tab)
- `projects/[id]/journeys/runs/[journeyRunId]` (run view)

Views go in `src/views/` like the rest of the app.

**List.** Uses `data-table`. Columns: name, step count, last run status (`RunStatusBadge`), 30-day pass rate, average duration, drift or needs-attention badge, and a Run split button (reusing `RunSplitButton` to pick the environment).

**Builder** (`JourneyBuilder`, composed from `ui/` primitives):

- A vertical step list in three groups: Setup, Steps, Teardown.
  - Reorder by drag (with a keyboard alternative using move up/down buttons).
  - Each row shows: position, name, a version chip with drift indicator, an auth profile chip, a continue-on-fail toggle, a retries count, and the step's outputs as small chips.
- **Add step:** a `command`-based picker that searches published test cases by code, name or suite, or adds an inline group.
- **Step drawer** (`sheet`):
  - Inputs: each declared input gets a `VariableInput` with `{{` autocomplete (via `popover` + `command`). It only lists outputs of earlier steps plus journey variables and built-ins.
  - Outputs: a capture editor with a "test capture" button that runs against the last run's page snapshot later on, and is disabled in v1.
  - Auth profile override: `select-menu`.
  - Timeout.
- **Validation** runs on save and shows errors inline on the row, for example "Step 3 uses `{{assessmentId}}`, which no earlier step captures".

**Run view** (`JourneyRunPage`):

- Header: status, environment, base URL, trigger, run prefix, total duration, and Cancel / Rerun buttons. These mirror the existing actions in `RunResultPage.tsx:132-166`.
- Body: a **vertical timeline** (`JourneyTimeline`). Each node shows:
  - step name, identity chip, `RunStatusBadge`, duration and attempt count
  - when expanded, the existing `StepScreenshots` and error panel from that child run (reusing `RunResultPage` sections via the child `test_runs` id)
  - the variables captured by that step (secret ones masked)
- Blocked steps are greyed out and labelled **"Skipped · blocked by step 2"**, with an anchor link to step 2.
- While a run is live: the active node pulses, polling uses `pollWhileVisible` (as `BatchRunPage.tsx` does), `WaitingHint` explains a queued run, and the attest loader shows while the first data loads.
- When the run finishes, a `sonner` toast appears and a bell notification is created.

**Elsewhere**

- `/runs` (`TestRunsPage`, fed by `list_grouped_runs`) shows journey runs as group rows, the same way it shows batches.
- The test case Runs tab shows child runs with an "in journey X" badge.
- The Runners page (`components/workers/running-now.tsx`, `slot-pills.tsx`) labels a busy slot "Journey · Evolv assessment flow · step 3/5".

**Storybook (required)**

- `JourneyTimeline`: Queued, Running (step 2 of 5), Passed, Failed with blocked steps, Cancelled during teardown, Timed out, Error (sign-in).
- `JourneyStepRow`: default, drift, needs attention, dragging, disabled.
- `VariableChip`: plain, secret, unresolved.

## 9. Recording a journey

| Option | Description | Verdict |
|---|---|---|
| **Compose existing test cases** | Record each case on its own (ADR-003), publish it, then chain them in the builder | **Do first.** It needs no recorder changes, it reuses tested pieces, and it keeps every step independently runnable. |
| Record across cases in one session | One recorder session. The tester presses "New step" to cut segments and "Capture" to mark an output. Each segment is saved as a test case or an inline group. | Later. The recorder is codegen-based today (`automation/framework/recorder.py`, ADR-018 section 1), so segment cutting and capture marking depend on structured step capture (`ai-assisted-recording.md`, capability 0). |

The "Open item: AI-generated test plans" in `ai-assisted-recording.md` could later propose journeys from user stories. That output would go into the builder for review, never straight into a saved journey.

## 10. Reporting

A `journey_overview` view gives these per journey, over the last 30 days:

- **Pass rate:** passed runs divided by terminal runs. `error` runs are excluded and shown separately as "could not run".
- **Most-failing step:** from child `test_runs` grouped by `(journey_id, step_index)` where Failed. Shown as "Step 3 · Assign to cohort fails in 7 of 9 failures".
- **Flaky journeys:** either `passed_first_attempt = false` (a step retry rescued the run), or a failed run followed within 24 h by a passing run of the same `journey_version` with no edits in between.
- **Duration** p50 and p95, and **slot-minutes** consumed (the cost of holding a slot).
- **Cleanup failures** count.

On the Dashboard:

- a "Journeys" KPI tile (pass rate and runs, in `kpi-strip.tsx`)
- failing or flaky journeys listed in `needs-attention.tsx`
- journey runs mixed into `recent-runs.tsx` with a journey icon

## 11. Risks

| Risk | Mitigation |
|---|---|
| **Brittleness**: one flaky step fails the whole journey | Keep journeys short (warn above 8 steps). Use per-step retries for read-only steps. "Most-failing step" points to the case to fix. Fix the step as a standalone test case first. |
| **Long runtimes hold a slot** | `JOURNEY_CONCURRENCY` (default 1 per worker) leaves room for other runs. 60 min hard cap. Slot-minutes are reported. The Runners page shows who is holding a slot. |
| **Data pollution** | Teardown runs always. `{{run.prefix}}` (`ATTEST-xxxxxx`) goes on every created entity name. A future sweep job deletes `ATTEST-*` data older than 24 h using a project-provided teardown journey. |
| **Test data management** | Journey variables with defaults. Prefer creating data in setup over relying on pre-seeded fixtures. Document which fixtures each journey assumes. |
| **Parallel journeys collide** on shared data (the same cohort or learner) | Unique prefixes for anything created. An optional per-journey `mutex_key` (for example `cohort:QA-1`) makes the backend queue a second run until the first finishes. Learner accounts are per profile, so two runs of the same learner journey are serialized by default. |
| **Version drift** | Pinned versions, a drift badge, and an "Update pin" action that shows the case's diff. Deleting a pinned case is blocked. |
| **Divergence from ADR-002**: steps are still codegen scripts, and placeholder substitution in script text is fragile | Inputs are substituted only inside string literals of known actions (`goto`, `fill`, `select_option`). Raise the priority of structured step capture. Journeys are a strong reason to do it. |
| **Secrets leaking** through screenshots, traces or captured values | Section 5.4: encryption, masking, no secrets in payloads or logs, traces disabled for secret actions. |
| **Crash mid-journey** leaves half-created data | No automatic requeue. The journey ends as `error` with the step named. The prefix sweep cleans up. |

## 12. Phased rollout

**MVP slice (PRs 1–5)** delivers: ordered test case steps, one shared context, a single auth profile, stop-on-fail, and the timeline view.

| # | PR | Size | Acceptance criteria |
|---|---|---|---|
| 1 | Runner executes a pinned `test_case_versions` snapshot; step executor accepts a given context | M | A standalone run of v3 runs v3's script even when v5 is current. The existing worker tests pass, and the executor is shared, not forked. |
| 2 | Migration, repositories, `JourneyService` CRUD and validation, delete guard on test cases | M | Can create, list, edit and delete journeys through the API. Referencing an unpublished or deleted case returns 400. Deleting a referenced case returns 409. Overview and notification views ignore child runs. pytest covers the happy path and failure paths. |
| 3 | Journey job: `JourneyRunService` + `testflow:journey-queue` + `runJourney.ts` (shared context, stop-on-fail, Skipped as blocked, cancel, journey timeout, crash → error, slot labels) | L | A 3-step journey runs in one slot. If step 2 fails, step 3 is Skipped "blocked by step 2". Cancel during step 2 works. Killing the worker leaves the journey as `error`, not requeued. FastAPI launches no browser. |
| 4 | Builder UI and nav (list, picker, reorder, save, drift badge) + stories | M | A tester builds the Evolv 5-step journey from existing cases without help. Storybook covers the row and picker states. Lint and type checks pass. |
| 5 | Run view timeline + history tab + `/runs` grouping + Runners slot label + stories | M | A failed run shows the failing step's screenshots and error, with downstream steps blocked. Live runs update without a reload. Timeline stories for all statuses. |
| 6 | Setup/teardown roles + `{{run.prefix}}` | M | Teardown runs after a pass, a fail, a cancel and a timeout. A teardown failure sets `cleanup_failed` without changing the verdict. |
| 7 | Variables: built-ins, URL/text/attribute captures, inputs with defaults, static validation, secret masking | L | Step 1 captures `assessmentId` and step 3 opens `/assessments/{{steps.1.assessmentId}}`. A forward reference is rejected at save. Secret values never appear in API responses, logs or screenshots (tested). |
| 8 | Per-step auth profiles, context per identity, `fresh_context` | M | admin → learner → admin works, and admin's context is preserved. A sign-in failure gives "Not started" on that step and `error` on the journey. |
| 9 | Per-step retries, `continue_on_fail`, `passed_first_attempt` | M | A retried step shows its attempts. Output-dependency blocking overrides `continue_on_fail`. |
| 10 | Reporting view + Dashboard tile + needs-attention | S–M | Pass rate, most-failing step and flaky list match hand-computed fixtures. |
| 11 | Journey kind on `POST /api/v1/runs` (idempotency, base-URL override, trigger) + CLI `--journey` | S (once ADR-012 lands) | A CI call with the same idempotency key returns the same run. Exit codes 0, 1 and 2 are correct. |
| 12 | Inline step groups | M | An inline group runs only inside its journey and doesn't appear in test case lists. |
| 13 | Record-a-journey | L | Deferred until structured step capture exists. |

## 13. Open questions

1. **"Rerun from step N".** Earlier steps' browser state can't be recovered, so is this ever safe? One option is to allow it only when every skipped step is marked `idempotent` and its outputs were captured, replaying the captured variables. The default answer is no for v1.
2. Should child step runs count towards a test case's flakiness metrics, or be reported separately?
3. **`mutex_key` scope.** Should it be per project or per environment? Should it be inferred from the auth profiles a journey uses?
4. Do journeys belong under a User Story (ADR-007's "cross-story chains" suggests they often span several stories), or only at project level with optional story links?
5. **Default `JOURNEY_CONCURRENCY`.** Is it 1 per worker, or a global cap through a Redis semaphore, so that a scaled-out pool doesn't run 10 journeys against one staging environment?
6. Should the batch tier run a journey in its own container, or should a CI suite plus journey share one container?
7. **Capture syntax.** Is regex-based URL capture enough, or should this be an ADR-010 capability (`journey.capture` step type) so captures are registry-driven from day one? The leaning is to register it as a capability.
8. **Cleanup sweep.** Who owns the `ATTEST-*` sweep for apps with no delete API? It could be a project-provided teardown journey run on a schedule, which depends on scheduling (out of MVP scope).
