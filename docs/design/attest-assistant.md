# Attest AI: in-app assistant and agents (design)

## 1. Status

| | |
|---|---|
| Status | **Proposed. Post-MVP, not scheduled.** |
| Owner | TBD |
| Date | 8 Oct 2026 |
| Constrained by | ADR-002 (structured definition is the source of truth), ADR-003 (recording is the primary authoring path), ADR-004 / ADR-018 (auth profiles; secrets never in logs or traces), ADR-007 (independent test cases), ADR-008 (FastAPI never launches a browser), ADR-010 (capability registry), ADR-012 (public Run API) |
| Builds on | `docs/design/ai-assisted-recording.md` (market research, ranked capabilities, masking pipeline, the "Open item: AI-generated test plans" section), `docs/design/e2e-journeys.md`, `docs/adr/ADR-018-auth-profile-sign-in.md`, and the Import test plan feature |
| Scope note | CLAUDE.md lists "AI test generation / self-healing selectors" as out of scope for the MVP. This is the umbrella plan for when the team schedules AI work. Nothing here is built. |

This doc is the **umbrella**. `ai-assisted-recording.md` holds the research (section 4), the build-vs-buy reasoning (section 7) and the per-capability details. This doc does not repeat them. It decides how all AI features reach the user (one assistant, many agents), what they share (adapter, review, provenance, budgets), and in what order to ship them.

## 2. Problem, goals, non-goals

**Problem.** The Evolv plan in `tools/test-plans/evolv-admin.json` (7 suites, 28 cases with Arrange/Act/Assert, start paths, assertions and an auth profile) was written by an AI from existing recordings and screenshots, then created in one step with `tools/import_test_plan.py`. That took a developer, a chat tool outside Attest, copy-paste, and a CLI. Testers should get the same result inside the app, with the same review step, for planning, for writing steps, and for understanding failures.

**Goals**

1. One front door: an **Attest AI** panel (✦) on every page, which knows where the user is.
2. Each AI capability is an **agent** the assistant can start. Agents report progress in the chat as a card.
3. Every agent ends in a **review handoff** to a screen that already exists (Import Review, test case edit mode, run detail). Nothing is saved until a person accepts it.
4. Shared plumbing built once: provider adapter, masking, prompt versions, provenance, budgets, telemetry.
5. Ship value early: Planner (from text) into Import Review first, because the contract and the review screen already exist.

**Non-goals**

- **No AI on the deterministic replay path by default.** A saved test replays from its definition with no model call. The Healer is the only exception, and it is opt-in per project (section 4.5).
- **No autonomous changes without review.** The model has no write path to test data. Only a person clicking Accept in an existing review screen writes, through the existing endpoints.
- **Not a general-purpose chatbot.** The assistant answers about this workspace's projects, tests and runs, and starts agents. Off-topic requests get a short refusal and a list of what it can do.
- No browser work in FastAPI (ADR-008). Browser-using agents run in the runner as queued jobs.
- No AI-only test format, and no agent that saves tests on its own (research doc, capability 8).

## 3. Experience

### 3.1 Entry point and panel

- A ✦ button (`lucide-react` `Sparkles`) in the top bar, between `RunnersIndicator` and `HelpMenu` in `frontend/src/components/layout/global-header.tsx`. Shortcut **⌘J / Ctrl+J**. ⌘K stays global search (`components/search/global-search.tsx:325`).
- It opens a right-side `Sheet`, the same primitive and width as the Runners slide-over (`components/runners/runners-panel.tsx:232`, `side="right"`). The page stays usable behind it, so a user can read a run while asking about it.
- Hidden entirely when AI is off for the project or account (section 5).

```
┌ Top bar ───────────────────────────────────────────────────────────────────────┐
│ ▣ Attest  Projects / Evolv / Login suite      [ Search… ⌘K ]   ⧉Runners ✦ ? 🔔 ◐ │
└────────────────────────────────────────────────────────────────────────────────┘
                                         ┌ Attest AI ─────────────────── ⤢  ✕ ┐
                                         │ Context: Evolv › TC-014 Wrong pass… │
                                         │ ─────────────────────────────────── │
                                         │  Suggested                          │
                                         │  [Explain this failure]             │
                                         │  [Write steps for this test]        │
                                         │  [Plan negative cases like this]    │
                                         │ ─────────────────────────────────── │
                                         │ You: why did the last run fail?     │
                                         │ ✦ The run stopped at step 4 …       │
                                         │   (agent card, see 3.3)             │
                                         │ ─────────────────────────────────── │
                                         │ [ Ask about this test…        ] [↑] │
                                         │ History ▾   Sonnet · AI can be wrong │
                                         └─────────────────────────────────────┘
```

### 3.2 Context and suggested prompts

The frontend sends a small **context object** with every message: `{ route, projectId, suiteId?, testCaseId?, runId?, selection? }`. The backend resolves it through services with the user's own permissions; the client never sends page content. The context chip at the top of the panel shows what the assistant can see and can be removed.

| Page | Suggested prompts | Agent |
|---|---|---|
| Project overview / suites | "Plan tests for a user story", "Find gaps in this suite" | Planner (text), Insights |
| Import test plan | "Generate a plan with AI" | Planner (text) |
| Environment / auth profile | "Explore this app and propose tests" | Planner (explore) |
| Test case, Steps tab | "Write steps for this test", "Suggest assertions" | Generator |
| Test case, Runs tab / run detail (failed) | "Explain this failure", "Is this flaky?" | Triage, Insights |
| Reports / dashboard | "What failed most this week?" | Insights |
| Journey (when built) | "Build a journey from these tests" | Journey builder |

### 3.3 Agent cards and review handoff

Agents run asynchronously and render as a card in the chat. The card is a fixed pipeline of named steps, each `done ✓`, `running ●`, `not reached ○` or `failed ✕`, like the reference agent-pipeline screenshot. It ends in exactly one primary action: the review handoff.

```
┌ ✦ Planner · from text ────────────────────────── 0:41 ┐
│ ✓ Read the user story and 6 acceptance criteria        │
│ ✓ Checked 3 existing suites and 41 test case names     │
│ ✓ Drafted 7 suites, 28 test cases                      │
│ ✓ Validated against the test plan format               │
│ ○ Waiting for your review                              │
│ ────────────────────────────────────────────────────── │
│ 2 cases skipped: names already exist.                  │
│ [ Review 28 test cases → ]   Discard   ⋯ (cost, model) │
└────────────────────────────────────────────────────────┘

┌ ✦ Generator ──────────────────────────────────── 1:12 ┐
│ ✓ Turned 5 sentences into 7 steps                      │
│ ✓ Opened /login on Staging as "Admin" (runner-2)       │
│ ✕ Could not find "Remember me" on the page             │
│ ○ Replay check                                          │
│ ────────────────────────────────────────────────────── │
│ 6 of 7 steps resolved. [ Review step changes → ]       │
└────────────────────────────────────────────────────────┘
```

- **"Review N test cases →"** opens `/projects/{id}/test-cases/import?suggestion={id}`. `TestPlanImportPage` skips Upload and lands on the Review step (`components/test-plans/review-step.tsx`) with the AI plan preloaded. The user ticks cases, picks environment and auth profile, and clicks Import as today.
- **"Review step changes →"** opens the test case in edit mode, Steps tab, as a **diff** (added / changed / removed rows, each with Accept / Reject). Runs and History tabs are unchanged. History shows the accepted version with an "AI suggested" tag.
- **Triage** ends in "Open run →" with the cause pinned above the failure, and an optional "Fix with Generator" follow-up.
- Cards are durable: a user can close the panel, and a notification (`NotificationsService.notify`, `backend/app/services/notifications_service.py:109`) with a link back to the card fires when the agent reaches review or fails.
- The `⋯` menu shows model, prompt version, tokens and cost, for trust and for the lead.

### 3.4 History

Conversations are stored per user and per project. "History ▾" lists the last 30 for the current project. Conversations are private to the user. A finished card can be shared by link, which opens the review screen, not the chat.

## 4. Agents

Shared rules for every agent: input is resolved and masked by the backend (section 5); output is a Pydantic schema we already own, validated server-side a second time; the result is saved as an `ai_suggestions` row, never directly as data; accepted items carry `source = ai` provenance.

Model choice: **Claude Sonnet 5.5** (`claude-sonnet-5-5`, $2 / $10 per M tokens in/out, cache reads $0.20) for generation and reasoning; **Claude Haiku 4.5** (`claude-haiku-4-5`, $1 / $5) for cheap passes (conversation titles, intent routing, triage pre-classification). Note for implementers: Sonnet 5.5 rejects forced `tool_choice` (`any`/`tool`), so schema-bound output uses structured outputs (`output_config.format`) or `strict: true` tools with `tool_choice: auto`. Costs below are estimates at those prices.

### 4.1 Planner (from text): first to ship

| | |
|---|---|
| Purpose | Turn a user story, acceptance criteria, a feature description or existing tests into a test plan in the Import format. |
| Inputs | Pasted text or a file (txt/md, later PDF); project context: existing suite names, case names (for de-duplication), environment base paths, auth profile **names only**; optional "extend suite X". |
| Tools | Read-only, bound to services: `list_suites`, `list_test_case_names`, `get_suite` (cases with AAA text), `list_environments` (name + path, no secrets), `list_auth_profile_names`. |
| Runs | Backend, design-time call. Short enough for an inline request with streaming progress; run as an `ai_agent_runs` row so the card and history work the same as for long agents. |
| Output | `TestPlan` (`backend/app/schemas/test_plan.py`), validated by `parse_json_plan` + `check_plan_rules` (`services/test_plan_formats.py`). |
| Review | Import Review via `TestPlanService.preview`, unchanged. |
| Guardrails | ADR-007 prompt rule and a server check: Arrange must not say "after test X"; every case independent. Each acceptance criterion maps to at least one case, and the mapping is shown in the review as a column. Assertions limited to the three `AssertionType` values. No `startPath` outside the environment (the schema already rejects scheme/host). |
| Cost | ~8–15k tokens in, ~6–12k out incl. thinking for a 28-case plan: **≈ $0.10–0.20 per plan**. |
| MVP vs later | MVP: text and existing tests. Later: PDF/Jira import, "regenerate this suite", priority and test data fields once the plan format has them. |

### 4.2 Planner (explore)

| | |
|---|---|
| Purpose | Sign in with an auth profile, walk the app, and propose scenarios whose assertions use **real on-page text** (the part a text-only plan guesses). |
| Inputs | Environment, auth profile, start paths or "whole app", page budget (default 20), focus hint. |
| Tools (runner) | A small Playwright MCP-style set implemented in the worker: `navigate(path)` (same origin as the environment only), `snapshot()` (trimmed aria snapshot, masked), `click(ref)` on links, tabs, menus and buttons whose name is not on a destructive denylist, `go_back()`, `propose_scenario(...)` (appends to the draft only). **No `fill`, no `upload`, no form submit, no Attest write tools.** |
| Runs | Runner, as a queued job (`kind: "ai_explore"`) with a fresh context. Sign-in uses `ensureAuthenticatedSession` (`worker/src/authProfiles.ts:171`) before the agent starts, so the model never sees the login. The worker holds **no model key**: each model turn goes through a backend internal endpoint that applies masking, budget and logging. All non-GET requests from the page are aborted with `page.route` during exploration, so a mis-click cannot change data. |
| Output | `TestPlan` plus per-case evidence (page path, snapshot excerpt used for each assertion). |
| Review | Import Review, with an "Evidence" disclosure per case. |
| Guardrails | Page budget, 10 min wall clock, job cancellation like runs, prompt-injection handling (section 5.4). |
| Cost | 20 pages × 3–8k-token snapshots, with history caching: **≈ $0.50–2.00 per run**, plus one runner slot for up to 10 min. |
| MVP vs later | Later (phase 4). Replaces the `crawler_service.py` + `test_generator_service.py` path, which launches Chromium in FastAPI (the known ADR-008 violation). Do not extend the crawler. |

### 4.3 Generator

| | |
|---|---|
| Purpose | Plain-language steps ("click Login, check the dashboard shows Welcome") or a raw recording → structured steps with live-verified locators. Covers research capabilities 1, 2 and 4. |
| Inputs | Test case (AAA text, startPath, environment, auth profile), user text, or the existing recording. |
| Tools | Backend: `get_test_case`. Runner compile job: `navigate`, `snapshot`, `resolve_locator(description)` that picks only from snapshot candidates, `dry_run(steps)`. |
| Runs | Backend drafts the step plan; runner grounds and dry-runs it (`kind: "ai_compile"`). |
| Output | The structured step and assertion schema from ADR-002 (does not exist yet, see 6.3). |
| Review | Edit mode, Steps tab, as a diff. Save is enabled only after the dry run passes. |
| Guardrails | Only step types in the schema; unresolvable phrases reported, not guessed; secrets in fills replaced with `{{placeholders}}` (ADR-018 syntax). |
| Cost | ≈ $0.05–0.20 per test plus a runner slot for 30–90 s. |
| MVP vs later | Blocked on structured step capture (research capability 0). Phase 3. |

### 4.4 Triage

| | |
|---|---|
| Purpose | Explain a failed run: likely cause (locator changed, text drift, environment/network, auth expired, setup) and a next action. |
| Inputs | Failed step and error message, `friendlyRunError` category (`frontend/src/lib/friendlyRunError.ts`, moved or mirrored server-side), step names, last 5 runs of the same case (pass/fail pattern), environment; failure screenshot only if the project allows screenshots. |
| Tools | `get_run`, `list_case_runs`, `get_test_case`. Read-only. |
| Runs | Backend, on demand ("Explain this failure"), never on every failure. Haiku pre-classifies; Sonnet writes the explanation only when the class is ambiguous. |
| Output | `{ cause: enum, confidence, summary (≤5 lines), evidence: [artifact refs], next_action: enum, suggested_fix? }`. |
| Review | Pinned on the run detail; "Fix with Generator" opens a Generator card. |
| Guardrails | Must cite which artifact it used; seeded-secret tests; never declares a run passed. |
| Cost | ≈ $0.01–0.03 per explanation. |
| MVP vs later | Phase 2. Better with traces, console errors and failed requests, which the worker does not capture yet (`worker/src/runTest.ts` stores the error, final and step screenshots). |

### 4.5 Healer

| | |
|---|---|
| Purpose | When a locator fails at run time, propose a replacement. Research capability 7. |
| Inputs | Failed step, its stored locator and alternates, current aria snapshot (masked). |
| Tools | None for the model beyond choosing among candidates. |
| Runs | Runner hook (registered through the ADR-010 capability model), model call proxied by the backend. **Off by default**, enabled per project. |
| Output | `{ step_id, old_locator, new_locator, evidence }` as an `ai_suggestions` row. |
| Review | Edit mode diff, plus an approval queue on the project. A healed run is `passed (healed)`, never `passed`. |
| Guardrails | Never touches assertions; cap per run; full audit trail (old, new, evidence, model, cost). |
| Cost | ≈ $0.005–0.02 per heal (Haiku first). |
| MVP vs later | Phase 5. Needs a status decision (research open question 4). |

### 4.6 Journey builder

| | |
|---|---|
| Purpose | Compose existing test cases into an ordered journey with captures and inputs (`e2e-journeys.md` §3). |
| Inputs | A goal ("admin creates an assessment, learner takes it"), the project's test case list with AAA text and declared inputs. |
| Tools | `list_test_cases`, `get_test_case`, `list_auth_profile_names`. |
| Runs | Backend. |
| Output | The journey definition schema from `e2e-journeys.md` (steps, `{{steps.N.x}}` references, per-step auth profile). Statically validated by the journey service before review. |
| Review | Journey editor, unsaved draft. Missing pieces are flagged as "inline step needed" rather than invented. |
| Cost | ≈ $0.05 per draft. |
| MVP vs later | After journeys ship. Phase 6. |

### 4.7 Insights

| | |
|---|---|
| Purpose | Q&A over runs and reports: "what failed most this week", "which tests are flaky on Staging". |
| Tools | Read-only, bound to existing services: `SearchService.search`, `DashboardService`, run listing with filters, flakiness stats (computed in a service, not by the model). |
| Runs | Backend chat turn with tool use. |
| Output | Text with **links** to runs, cases and suites (every claim cites a link); small tables rendered by the panel. |
| Guardrails | No raw SQL tool; answers limited to projects the user can see; "I don't know" when tools return nothing. |
| Cost | ≈ $0.01–0.05 per question. |
| MVP vs later | Phase 6. |

## 5. Architecture

### 5.1 Components

```
frontend  ✦ AssistantSheet ─► /api/assistant/* ─► AssistantService ──► integrations/llm/LlmClient
                    ▲  SSE / poll                     │                    ├ AnthropicLlmClient (default)
                    │                                 │                    └ FakeLlmClient (tests)
                    │                                 ├► AgentRunService ─► agents/ registry (definition per agent)
                    │                                 │      │ tools = thin wrappers over existing services
                    │                                 │      └► queue (job_store, kind=ai_*) ─► worker agent loop
                    │                                 │                                         │ model turns via
                    │                                 │◄─────── /internal/ai/agent-runs/{id}/* ◄┘ backend proxy
                    │                                 ├► MaskingPipeline · PromptRegistry · UsageRepository
                    └── notifications ◄───────────────┴► SuggestionService ─► TestPlanService / TestCasesService (on Accept)
```

- **`backend/app/integrations/llm/`**: `LlmClient` protocol with `complete_structured(prompt_id, version, inputs, schema)` and `run_tools(...)`; `AnthropicLlmClient` (official `anthropic` SDK); `FakeLlmClient` for tests. Settings only in `app/config.py`: `LLM_ENABLED=false`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL_DEFAULT=claude-sonnet-5-5`, `LLM_MODEL_FAST=claude-haiku-4-5`, `LLM_MAX_TOKENS`, `AI_SCREENSHOTS_DEFAULT=false`.
- **`backend/app/agents/`**: one small module per agent (`planner_text.py`, `planner_explore.py`, `triage.py`, …) declaring id, prompt id/version, model tier, allowed tools, output schema, `runs_on: backend | runner`, step labels for the card. No god service: `AgentRunService` owns lifecycle only; each agent owns its logic.
- **Tools bound to services, never SQL.** A tool is a function that calls an existing service method with the requesting user's identity (e.g. `TestSuitesService.list_for_project`), then masks the result. Router → service → repository direction is unchanged.
- **Structured outputs bound to our schemas.** The response schema is generated from `TestPlan` (and later the step schema). Constrained decoding does not support every Pydantic constraint (lengths, custom validators, the `assert` alias), so the server always re-validates with `parse_json_plan`, and a failed validation gets one repair turn with the error list, then fails the card.
- **Long-running agents** are `ai_agent_runs` rows plus, for runner agents, a queue job. Use a **separate Redis list** (`testflow:ai-queue`) with its own worker slot budget (`AI_WORKER_SLOTS`, default 1), so exploration never starves test runs. Payload is minimal: `{ id, kind, agentRunId }`, unlike today's test payload with `configPath` (`backend/app/queue/job_store.py:42-78`). Lease, reaper, cancel and crash recovery reuse the existing job store.
- **Progress** goes to the chat by SSE (`GET /agent-runs/{id}/events`), with polling as the fallback (the app already polls for runs). Each event updates one card step. Terminal states also create a notification.
- **Browser agents only in the runner**, fresh context per agent run, sign-in through ADR-018 before the model gets control, storageState never read by agent code.
- **Prompts and versions** live in the repo (`integrations/llm/prompts/<id>/v<n>.md`); id, version and model are stored on every agent run and suggestion.
- **Provenance**: `test_cases.source` (`manual | recorded | csv | json | ai`) and `source_ref` (suggestion id). Accepted steps/assertions get the same fields when structured steps exist.
- **Budgets**: there is no workspace table yet, so budgets apply per account (`profiles`) and per project: monthly USD cap, per-run token cap, per-user rate limit. A run that would exceed the budget is refused before the model call.
- **Telemetry**: structured events `ai.agent_run.started/progress/needs_review/failed`, `ai.suggestion.accepted/rejected` with request ID, agent, prompt version, model, tokens, cost, latency. **No prompt or response bodies in logs.** Headline metric: acceptance rate per agent and prompt version (accepted items ÷ proposed items).

### 5.2 Data model sketch (one migration per phase, UUID ids, `created_at`/`updated_at`)

```
ai_conversations  id, user_id, project_id, title, context jsonb, archived_at
                  idx (user_id, project_id, updated_at desc)
ai_messages       id, conversation_id, role (user|assistant|tool|card), content jsonb (masked),
                  agent_run_id null, input_tokens, output_tokens          idx (conversation_id, created_at)
ai_agent_runs     id, conversation_id null, project_id, user_id, agent, status
                  (queued|running|needs_review|completed|failed|cancelled), steps jsonb [{key,label,status}],
                  input_ref jsonb (ids, not page text), runner_job_id, prompt_id, prompt_version, model,
                  input_tokens, output_tokens, cost_usd, error, started_at, finished_at
                  idx (project_id, created_at desc), (status)
ai_suggestions    id, agent_run_id, project_id, kind (test_plan|step_diff|locator_change|triage|journey),
                  target_type, target_id null, payload jsonb, status (pending|accepted|partially_accepted|
                  rejected|expired), proposed_count, accepted_count, accepted_by, accepted_at, applied_refs jsonb
                  idx (project_id, status), (target_type, target_id)
ai_settings       scope (account|project), scope_id, enabled, screenshots_allowed, healing_enabled,
                  monthly_budget_usd, retention_days
test_cases        + source text default 'manual', + source_ref uuid null
```

`project_id` and `target_id` are conceptual references (CLAUDE.md), so `AgentRunService` validates them before writes, and project deletion deletes its AI rows explicitly.

### 5.3 API sketch (mounted under `/api`)

```
POST  /assistant/conversations                         {projectId, context} → conversation
GET   /assistant/conversations?projectId=              list (history)
GET   /assistant/conversations/{id}/messages
POST  /assistant/conversations/{id}/messages           {text, context} → 202 {messageId}; stream via events
GET   /assistant/conversations/{id}/events             SSE: token deltas, card created/updated
GET   /assistant/agent-runs/{id}                       card state      POST …/{id}/cancel
GET   /assistant/agent-runs/{id}/events                SSE progress
GET   /assistant/suggestions/{id}                      payload for the review screen
POST  /assistant/suggestions/{id}/accept               {selection} → applies via existing services
POST  /assistant/suggestions/{id}/reject               {reason?}
POST  /projects/{id}/test-plans/generate               {source:"text", text, suiteName?} → agent run (button path)
GET   /projects/{id}/ai-settings   PUT /projects/{id}/ai-settings
POST  /internal/ai/agent-runs/{id}/model-turn          runner → backend proxy (service token, masked)
POST  /internal/ai/agent-runs/{id}/progress | /result   runner → backend, idempotent
```

Errors follow `{ "message": "..." }`; 400 for validation, 403 when AI is off, 429 with a reset time when a budget or rate limit is hit.

## 6. Safety and privacy

1. **Secrets never reach the model.** Credentials, `storage_state_enc`, cookies, auth headers and ADR-018 placeholder values are never loaded by agent code. Auth profiles are exposed to tools by **name and id only**. Sign-in finishes before an explore or compile agent gets control.
2. **Masking pipeline** (research doc §6) runs on every tool result and every proxied runner turn: fill values → `{{value_n}}`, redact emails, phone numbers, card-like numbers, JWT/API-key patterns, URL query strings; strip `value` attributes from snapshots; size-cap snapshots. Seeded-secret tests in CI assert nothing leaks into prompts, `ai_messages`, logs or suggestions.
3. **Screenshots are opt-in** per project (`screenshots_allowed`), masked (Playwright `mask` on inputs) before sending, and never stored in AI tables.
4. **Prompt injection.** Page text is untrusted. The explore and compile agents read customer pages, so: page content is passed only inside tool results and labelled as data; the tool set is minimal and has no write tools (no Attest writes, no fills, no submits, non-GET requests aborted); navigation is same-origin; output only through `propose_scenario`, which is schema-validated; every proposal still goes through human review. The chat assistant's own tools are read-only plus "start agent", so an injected instruction can at worst produce a bad suggestion that a person rejects.
5. **AI-off switch** per account and per project (`ai_settings.enabled`), plus the global `LLM_ENABLED=false` for self-hosted deployments. When off, the ✦ button and all "with AI" entry points are hidden and the API returns 403.
6. **Retention.** Conversations and agent-run inputs default to 90 days (configurable per project), then deleted by a sweep. Accepted suggestions keep their provenance row; payloads are trimmed after acceptance. Use a provider with zero/limited data retention terms; document what leaves the stack.
7. **Rate limits and budgets**: per user (e.g. 30 messages / 10 min), per project concurrent agent runs (2), per account monthly USD cap, per-run token cap. Explore and compile jobs also count against runner capacity.

## 7. How the Import branch evolves into the AI foundation

The Import feature (currently uncommitted on `feat/ui-revamp`; planned as `feat/test-plan-import`) already has what an AI planner needs: a strict schema (`TestPlan`), friendly validation errors, a dry-run preview, per-item selection, a review UI, and a CLI over the same API. The plan format becomes **the shared contract** between AI, CSV, JSON and export.

### 7.1 Fix first (no AI; makes imported plans honest)

1. **Persist structured assertions.** Today `_create_case` (`services/test_plan_service.py`) sends only `text_visible` assertions, and `test_case_repository.py:286-292` keeps just the first assertion's value as `expected_result` (the demo path also clears `assertions`, `:251-260`). There is no `assertions` column. Add one (jsonb, migration) and keep all assertions. Size **M**.
2. **Enforce `url_contains` and `page_title_contains` in the worker.** `worker/src/runTest.ts:195-200` only checks `expectedResult` as body text. Evaluate every stored assertion after the steps, with clear messages ("URL did not contain /admin"), and teach `friendlyRunError` the new messages. Without this, all 18 `url_contains` assertions in the Evolv plan are silently dropped, and so is every `text_visible` after the first in a case. Size **M**.
3. **Provenance.** Add `source` to `TestPlanRequest` (`manual | csv | json | ai`, default from `format`), plus optional `suggestionId`; write `test_cases.source/source_ref`; include `source` in the `event=test_plan_imported` log. Size **S**.
4. **Idempotent apply.** Import is per item and not transactional, and de-duplicates by case name. Add an `importId` (idempotency key) so a retried accept does not double-create, and return created ids so the suggestion can record `applied_refs`. Size **S**.
5. **Plan format additions** that AI needs and CLAUDE.md already defines: `priority`, `preconditions`, `testData`, optional `criteria` (which acceptance criterion a case covers). Additive, optional, versioned (`"version": 2`). Size **S**.

### 7.2 Then add AI

6. **"Generate with AI"** as a third segment next to Upload / Paste in `components/test-plans/upload-step.tsx` (`UploadMode = "upload" | "paste" | "ai"`). It shows a textarea for the story/criteria, optional "extend suite", and Generate. It starts a Planner card and, when done, moves the stepper to Review with the plan loaded. The ✦ panel and this button call the same endpoint.
7. **`?suggestion={id}`** on the import route loads `GET /assistant/suggestions/{id}` into `content` (the request already accepts a dict) and skips Upload. Accept calls the existing `/test-plans/import` with `source: "ai"` and `suggestionId`.
8. **Review UI additions**: an "AI" badge, a "Covers criterion" column, an evidence disclosure (explore), and "Regenerate this suite". Same components, extra optional props, Storybook stories for each.
9. **CLI**: `tools/import_test_plan.py --generate story.md` calls the generate endpoint and prints the preview, so the developer loop that produced `evolv-admin.json` becomes a product path with a script fallback.

### 7.3 Gaps to keep in view

- Imported cases have **no steps**; the user records each one (ADR-003). The plan's `act` text is the Generator's input later.
- Steps are stored as **scripts**, not structured steps (`StepsTab` parses them with `parseScriptSteps`; playback translates them in `worker/src/playback.ts`). Research capability 0 is a hard prerequisite for Generator and Healer.
- No **User Story** entity exists in the schema yet, so the Planner takes stories as text. When stories exist, link generated cases to them.

## 8. Rollout

Each item is one PR-sized change. S ≤ 1 week, M 2–3 weeks, L 4+ weeks, one engineer.

| Phase | Item | Size | Acceptance criteria |
|---|---|---|---|
| 0 | Import fixes 7.1 (1–5) | M+M+S+S+S | All assertion types stored and enforced; a url-only case fails when the URL is wrong; `source` stored; re-sent import with the same `importId` creates nothing. |
| 1 | LLM adapter, settings, masking, usage, `ai_settings`, flag | M | `LLM_ENABLED=false` means no outbound calls (test); seeded-secret tests pass; cost recorded per call. |
| 1 | Chat shell: ✦, ⌘J, Sheet, conversations, context chip, suggested prompts, agent card (Storybook: queued, running, needs review, failed, cancelled) | M | Panel works on every project page; history persists; hidden when AI is off. |
| 1 | Planner (text) + "Generate with AI" + `?suggestion=` review handoff | M | A pasted story produces a valid plan in < 60 s; nothing is created until Import; accepted cases carry `source=ai`; criteria mapping shown. |
| 2 | Triage | S–M | On-demand only; cites artifacts; correct cause class on a labelled set of 30 past failures ≥ 70%. |
| 3 | Structured step capture (research capability 0, no AI) | M | Recording saves structured steps; replay from steps. |
| 3 | Generator (backend draft + runner compile job + diff in edit mode) | L | No step type outside schema; unresolved phrases reported; save blocked until dry run passes. |
| 4 | Planner (explore): `ai-queue`, worker agent loop, backend model proxy, non-GET block | L | No model key in the worker; no non-GET request leaves the page during exploration (test); assertions use text seen on the page. |
| 5 | Healer (opt-in), `passed (healed)`, approval queue | L | Off = identical behaviour to today; heals never touch assertions; every heal audited. |
| 6 | Insights; Journey builder (after journeys) | M; M | Every answer links its sources; journey drafts pass static validation. |

**Success metrics**

- Planner acceptance rate ≥ 60% of proposed cases imported; time from story to imported cases < 5 min (baseline: the manual Evolv flow).
- Generator: ≥ 50% of tests saved with no manual step edits after accepting.
- Triage: ≥ 50% of explanations rated helpful (thumbs on the card); fewer "re-run to see" reruns.
- Cost per active project per month stays under the default budget (proposed $20).
- Zero secret-leak findings in seeded tests and log scans.

## 9. Build vs buy, risks, costs, open questions

**Build vs buy.** Build thinly on the Claude API with our own adapter, as argued in `ai-assisted-recording.md` §7: commercial tools own their step format and runner (conflicts with ADR-002/008), and the open-source browser agents put the model on the replay path or are AGPL. For the agent loop, use the API SDK's tool-use loop (Python in the backend, TypeScript in the worker) rather than the Claude Agent SDK (a Claude Code harness with bash and file tools, far more than we need) or Managed Agents (hosts the loop and a sandbox outside our runner boundary). `e2e/` (Playwright Test Agents with Claude) stays a developer tool for testing Attest itself; its planner / generator / healer split is the pattern we borrow, and its prompts (`e2e/.claude/agents/*.md`) are a useful starting point for ours.

**Risks**

- *Plausible but wrong plans* (invented text in assertions). Mitigated by review, "unverified" labels on text-only plans, and the explore planner's evidence.
- *Data leakage* to the provider. Masking, opt-in screenshots, kill switches, retention terms.
- *Prompt injection* from customer pages. Read-only tools, non-GET block, schema-only output, review.
- *Runner contention* from explore/compile jobs. Separate queue and slot budget.
- *Cost creep*. On-demand triggers, budgets, Haiku for cheap passes, prompt caching of stable system prompts and tool lists.
- *Prerequisite debt*: script-based steps and unenforced assertions. Phase 0 and capability 0 come first.
- *Scope creep into a general chatbot*. Narrow tool set and an explicit refusal for off-topic requests.

**Costs (rough).** Model spend per active project: ~10 plans ($2), ~50 triages ($1), ~30 generator runs ($5), 2 explorations ($4), chat/insights ($2): **≈ $15 per project per month**. Engineering: phases 0–2 ≈ 10–12 engineer-weeks; through phase 4 ≈ 22–26.

**Open questions for the team**

1. Which provider and data-processing terms are acceptable for customer apps, and do self-hosted customers need a local-model option behind the same adapter?
2. Budgets: per account now, per workspace later. Who sets the default, and what happens at the cap (block or warn)?
3. Should conversations ever be shared within a project, or only cards and suggestions?
4. Is `passed (healed)` a new TestRun status (ADR-012 contract change) or metadata on `passed`?
5. Should the Planner write cases in the plan format only (no steps) forever, or carry draft steps once Generator exists?
6. Explore safety: is "abort all non-GET requests" acceptable for apps that load data with POST (GraphQL)? Proposed: allow POSTs to an allowlisted path such as `/graphql` with read-only operation names.
7. Who owns prompt evaluation and the regression set (e.g. Evolv stories → expected plans, 30 labelled failures)?
8. Does Phase 1 wait for Phase 0's assertion fixes, or ship with a visible "only text checks run today" warning?
