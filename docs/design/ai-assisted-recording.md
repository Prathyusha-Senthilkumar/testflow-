# AI-assisted recording — design

## 1. Status

| | |
|---|---|
| Status | **Proposed. Post-MVP, not scheduled.** |
| Owner | TBD |
| Date | 8 Oct 2026 |
| Constrained by | ADR-002 (structured definition is source of truth), ADR-003 (recording-first), ADR-008 (FastAPI never launches a browser), ADR-010 (capability registry), ADR-018 (auth profile sign-in) |
| Scope note | CLAUDE.md lists "AI test generation / self-healing selectors" as **out of scope for the MVP**. Nothing here should be built until the team schedules it. |

## 2. Problem, goals, non-goals

**Problem.** Recording is our main authoring path. Today it gives us a raw codegen script. That script has duplicate fills, CSS-ish locators, no step names and no assertions. The QA user has to clean it up by hand and add every assertion. When a run fails, they read the trace and work out the cause on their own.

**Goals (when scheduled)**

1. Make a recorded test reviewable and robust before it is saved: clean steps, plain-English names, role/text locators.
2. Cut the time to a useful test: suggest assertions, and let users author steps in natural language.
3. Shorten triage: explain a failed run in plain English from artifacts we already store.
4. Draft test cases from a User Story's acceptance criteria.

**Non-goals**

- **No AI on the replay path by default.** A saved test replays deterministically from structured steps. The runner makes no model call unless a project explicitly opts into self-healing (capability 7).
- **No self-healing in the MVP.** It is listed in CLAUDE.md as out of scope. Capability 7 is a later, opt-in feature with an audit trail.
- No autonomous "explore my app and write the tests" agent that saves without a human.
- No AI-only test format (natural language interpreted at every run). That would conflict with ADR-002.
- No browser or agent work inside FastAPI (ADR-008).

## 3. Current recording flow (as of this branch)

1. The UI asks the backend to record. The backend delegates to a **host recorder**, because codegen needs a desktop GUI: `backend/host_recorder_main.py` (FastAPI on the host, `/record` and the login variant). It calls `run_playwright_recording` in `backend/app/services/automation_service.py`.
2. `automation/framework/recorder.py` (`PlaywrightRecorder.record`, `build_codegen_command`) runs `python -m playwright codegen --browser chromium --target <recording_target> --output <file> [--load-storage …] <url>`. `automation/config/framework.json` sets `recording_target: "python-pytest"`. The script is written under `automation/generated/<project>/<case>/`.
3. At run time the Node worker (`worker/src/index.ts` → `runRecordedTest` in `worker/src/runTest.ts`) reads the script. `worker/src/playback.ts` (`scriptBody`, `translatePython`, `translateJavaScript`, `applyEnvironment`) rewrites it line by line into JavaScript and points `page.goto` at the selected environment. The worker then executes it. Step screenshots come from `withStepShots`.
4. The login variant (`record_storage_state`) records a sign-in and saves storageState for an Auth Profile. ADR-018 replaces this with `recorded_flow`.

**Gap that matters for AI.** The stored artifact is a *script*, not the structured steps that ADR-002 requires. Every AI feature below needs structured steps as input and output: an LLM editing free-form scripts would be unreviewable and unsafe to execute. So capability 0, which uses no AI, comes first.

Worker Playwright is pinned at `1.63.0` (`worker/package.json`). The backend floats at `playwright>=1.40.0` (`backend/requirements.txt`), so the version that does the recording is not controlled.

## 4. Market landscape (condensed, researched 8 Oct 2026)

**[3rd-party]** marks a claim taken only from a non-vendor source (blog, directory or aggregator). Repo metadata comes from the GitHub API on 8 Oct 2026.

### Open-source building blocks

| Tool | What it does | Output | AI at replay? | License / activity | Fit for us |
|---|---|---|---|---|---|
| [Playwright Test Agents](https://playwright.dev/docs/test-agents) (planner / generator / healer, since 1.56) | Plans from a live app, generates tests, heals failing tests | Markdown plan + `.spec.ts` | No (healer is a dev-time agent) | Apache-2.0, Microsoft | Good *pattern* reference. Outputs code, not our steps. Developer tool. |
| [Playwright codegen](https://playwright.dev/docs/release-notes) | Records actions. Auto `toBeVisible()` assertions (1.55), aria-snapshot picking (1.50) | Code | No | Apache-2.0 | Already in use. Cheap wins without an LLM. |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | LLM drives the browser via accessibility snapshots. Has locator/verify tools. Bundled as `npx playwright mcp` in 1.64 | Runtime agent | Yes, if used at run time | Apache-2.0, ~37.9k★, active | Use at design time inside the runner for NL grounding. Also a dev tool. |
| [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) | Agent access to DevTools: traces, console, network, DOM | Runtime agent | n/a | Apache-2.0, ~53k★ | Developer debugging tool, not a product dependency. |
| [Stagehand](https://github.com/browserbase/stagehand) (v4, Aug 2026) | `act/observe/extract` in natural language. [Action caching](https://docs.stagehand.dev/v4/best-practices/caching) replays without the LLM and falls back to inference on a cache miss | Runtime SDK + cache | Only on a cache miss | MIT, ~25.6k★, active | Closest match to "compile once". Its fallback is implicit self-healing. Pattern reference. |
| [Browser Use](https://github.com/browser-use/browser-use) | General LLM browser agent (Python) | Runtime agent | Yes | MIT, ~117k★ | Poor fit for repeatable tests. |
| [workflow-use](https://github.com/browser-use/workflow-use) | Record in an extension → LLM turns it into a parameterised `.workflow.json` → replay without an LLM, agent fallback | Structured JSON | Only on failure | **AGPL-3.0**, self-described "early development" | Same idea as our capabilities 1 + 4. AGPL rules out embedding it. |
| [Midscene.js](https://github.com/web-infra-dev/midscene) | Vision-model UI agent. JS SDK + YAML, Playwright integration | Runtime agent / YAML | Yes | MIT, ~15k★ | Vision at every run hurts determinism and cost. |
| [Skyvern](https://github.com/Skyvern-AI/skyvern) | Vision + LLM workflow agents ("Agents" API, June 2026) | Runtime agent | Yes | **AGPL-3.0**, ~23k★ | RPA-oriented. AGPL. No. |
| [Shortest](https://github.com/antiwork/shortest) | NL tests run via the Claude API on Playwright | Runtime agent | Yes | MIT. Last commit May 2026 (housekeeping) | Slowing down. Reference only. |
| [Auto Playwright](https://github.com/lucgagan/auto-playwright) | `auto("…")` via OpenAI | Runtime | Yes | MIT. Last push Jul 2025 | Stale. |
| [LaVague](https://github.com/lavague-ai/LaVague) | NL → Selenium/Playwright code agent | Code | n/a | Apache-2.0. Last push Jan 2025 | Inactive. |
| ZeroStep | `ai()` steps in Playwright, from the Reflect team | Runtime | Yes | The repo `zerostep-ai/zerostep` returns 404 | Treat as discontinued (unverified). |

### Anthropic / Claude options

| Option | What it is | Realistic use |
|---|---|---|
| Claude API + structured outputs / strict tool use | JSON-schema-constrained output (`output_config.format`, `strict: true`) | **Product.** Backend design-time calls that return our step/assertion schema. |
| [`webapp-testing` skill](https://github.com/anthropics/skills/tree/main/skills/webapp-testing) (Apache-2.0) | Teaches an agent to write Python Playwright scripts against local apps | Developer tool for our team, not for our users. |
| Claude Agent SDK + Playwright MCP | Claude Code harness with browser tools | Developer tool. Possible runner-side NL grounding (capability 4). Heavy for the product. |
| Computer use (`computer_toolset_20260801`, GA on the Claude API) | Screenshot + mouse/keyboard agent | Not for test replay. Pixels at every run means no determinism. |
| [Claude in Chrome](https://support.claude.com/en/articles/12306336-claude-in-chrome-release-notes) (GA 26 Aug 2026 [3rd-party: [Gigazine](https://gigazine.net/gsc_news/en/20260827-claude-chrome-available/)]) | Extension with "teach a workflow by recording" shortcuts | End-user assistant. Not embeddable. |

### Commercial products (benchmarks; none needed as a dependency)

| Product | What its "AI recording/authoring" does | Output / determinism |
|---|---|---|
| [QA Wolf](https://www.qawolf.com/ai) | Multi-agent (outliner → code writer → verifier) plus human reviewers | Playwright/Appium code. Deterministic. |
| [mabl](https://help.mabl.com/changelog/early-access-for-advanced-auto-heal) | Auto-heal. "Active Coverage" agentic creation/triage, Apr 2026 [3rd-party: [qaskills](https://qaskills.sh/blog/mabl-active-coverage-agentic-testing-2026)] | Proprietary steps. |
| [Momentic](https://momentic.ai/docs/reliability/step-cache.md) | NL steps. Multi-signal **step cache** replays without AI and auto-heals on a miss. The run viewer shows cache hit/miss | YAML. AI only on a cache miss. |
| [Applitools Autonomous](https://applitools.com/platform-overview/) | NL or recorded steps, "deterministic execution (no LLMs at runtime)" [3rd-party summary] | Proprietary steps. |
| [Autify Nexus / Genesis](https://autify.com/products/autify-nexus) | NL recorder → structured editable steps. Requirements → Gherkin → Playwright. "Fix with AI" asks before swapping a locator | Exports Playwright. |
| [TestMu AI (ex-LambdaTest) KaneAI](https://ecommercenews.co.nz/story/lambdatest-rebrands-as-testmu-ai-with-agentic-testing-shift) | NL authoring, two-way NL/code editing, healing | Exports Playwright/Selenium/Cypress [3rd-party]. |
| [BrowserStack AI](https://www.browserstack.com/press/browserstack-launches-suite-of-ai-agents-to-redefine-software-quality-at-scale) | Test-case generator from PRDs/stories. Low-code authoring agent (NL → actions + validations) | Low-code steps. |
| [Tricentis Testim](https://www.tricentis.com/blog/testim-locator-technologies) | Multi-attribute "smart locators", self-healing | Proprietary. |
| [Checksum](https://webcatalog.io/en/apps/checksum) [3rd-party] | Flows from real user sessions → Playwright/Cypress. Opens PRs to fix broken tests | Code, with healing via PR. |
| testRigor [3rd-party: [techjockey](https://www.techjockey.com/us/detail/testrigor)] | Plain-English grammar interpreted at run time | Proprietary. |
| Reflect ([acquired by SmartBear, Jan 2024](https://smartbear.com/news/news-releases/smartbear-acquires-reflect/)) | NL test steps via LLMs | Proprietary. |
| Octomind | Agent-generated Playwright tests. **Shut down May 2026** [3rd-party: [rywalker.com](https://rywalker.com/research/octomind)]. The `octomind.dev` domain did not resolve on 8 Oct 2026 | Its users kept portable Playwright code. |

**Takeaway.** The serious products have converged on one pattern: **AI at authoring time, deterministic replay, AI again only on failure, and every change visible to the user.** Momentic's step cache, Stagehand's action cache, Applitools' "no LLMs at runtime" and Autify's "Fix with AI" prompt all follow it. That pattern fits ADR-002 and ADR-008. The Octomind shutdown is a reminder not to build on a vendor's proprietary step format.

## 5. Proposed capabilities (ranked by value ÷ effort)

Effort: S ≈ ≤1 week, M ≈ 2–3 weeks, L ≈ 4+ weeks, for one engineer.

"Design-time backend call" means FastAPI sends text to the LLM provider and gets back JSON. No browser is involved, so this is allowed under ADR-008. Anything that needs a live page runs in the **runner** as a queued job.

### 0. Structured step capture (prerequisite, no AI). Effort M

- **Flow:** Record → the recording is converted into ADR-002 steps (`navigate/click/fill/select/press/upload/scroll/reload/wait` + locator + value) and assertions → the user edits steps in the builder → save.
- **Where:** Parse the codegen output deterministically: either a JS target parsed with an AST, or the existing `playback.ts` line rules moved to "script → steps". Turn on codegen's automatic `toBeVisible()` assertions (Playwright ≥1.55) and pin the recorder's Playwright version to match the worker.
- **Data to model:** none.
- **Acceptance:** A recorded login + navigation saves as structured steps. Replay comes from steps, not from the script. Re-running produces identical steps.

### 1. AI step cleanup and naming. Effort S–M

- **Flow:** After capture, the user clicks "Tidy steps" and sees a **diff**: duplicate fills merged, accidental clicks dropped, each step named ("Enter email"), and brittle CSS/nth locators swapped for `getByRole`/`getByLabel`/`getByText` candidates. They accept or reject each change.
- **Where:** A design-time backend call. Locator *candidates* should come from what the recorder saw (an aria snapshot captured at record time). The model only chooses among them and never invents one. A changed locator is checked by a dry-run replay job in the runner before save.
- **Data to model:** Step JSON + a trimmed accessibility snapshot. Fill values replaced with `{{value_n}}` tokens. No screenshots.
- **Determinism:** Output is saved as normal steps, so replay has no AI.
- **Acceptance:** The model never adds an action type outside our schema. Every change appears in the diff. Rejecting everything restores the original exactly. The dry-run passes before save.

### 2. Suggested assertions. Effort M

- **Flow:** At the end of recording, or on any step: "Suggest assertions" proposes 3–5 checks (URL, visible heading, text, enabled, count) with a short rationale. The user ticks the ones to keep.
- **Where:** A design-time backend call over the post-step aria snapshot that the runner/recorder already captured.
- **Data:** Aria snapshot text, the URL with the query string stripped, and step names. Masked as described in §6.
- **Acceptance:** Suggestions use only our assertion types and locators that exist in the snapshot. None is saved without a tick. Saved assertions are tagged `source: ai_suggested`.

### 3. Failure explanation and triage. Effort M

- **Flow:** On a failed run, "Explain failure" gives a 3–5 line summary: likely cause (locator changed, assertion text drift, environment/network, auth expired) and a suggested next action. It links to the step, screenshot and trace.
- **Where:** A design-time backend call over artifacts we already store: failed step, error, console errors, failed requests, and optionally the failure screenshot.
- **Data:** This sends the most data of any capability. Masking is required. Screenshots are off by default and enabled per project.
- **Determinism:** Read-only. It changes nothing.
- **Acceptance:** Runs on demand, not on every failure (cost). Cites which artifact it used. Never shows secrets in the explanation (checked with seeded-secret tests).

### 4. Natural-language steps compiled once. Effort M–L

- **Flow:** In Act, the user types "click Login, then check the dashboard shows Welcome". The system shows the proposed structured steps and assertions with resolved locators. The user accepts, and they become ordinary steps.
- **Where:** Two parts. (a) A backend LLM call turns the text into a step *plan*. (b) Locators are grounded against a live page in the **runner**, as a queued "compile" job using the same browser context and auth profile as a run. The runner may use Playwright MCP / aria snapshots internally. FastAPI never touches the browser.
- **Determinism:** Compiled once and stored as steps. No AI on replay.
- **Acceptance:** Unresolvable phrases are reported, not guessed. The compile job obeys run timeouts and cancellation. The result replays green before the user can save.

### 5. Test planning from User Stories. Effort M

- **Flow:** On a User Story, "Draft test cases from acceptance criteria" proposes case outlines: title, scenario type (Happy/Negative/Edge), priority, and Arrange/Act/Assert in prose. The user picks some, and each becomes an empty case to record.
- **Where:** A design-time backend call. Text only.
- **Acceptance:** Each criterion maps to at least one case, and the mapping is shown. Outlines respect ADR-007: every case is independently runnable and none depends on another case.

### 6. Login-flow placeholders. Effort S (AI part only)

- `docs/adr/ADR-018-auth-profile-sign-in.md` already defines `recorded_flow`: record the login once with `{{username}}`/`{{password}}`/`{{totp}}` placeholders and replay it through an allowlisted step executor. **This design does not change that.**
- The only optional AI add-on is a *detector* that flags fills which look like secrets in an ordinary recording (password fields, tokens, emails) and offers to turn them into placeholders or Test Data variables. Prefer heuristics (input `type=password`, `autocomplete`, label text) and use the model only as a fallback over masked labels. Never send the values.

### 7. Opt-in self-healing with an audit trail. Effort L. Out of MVP scope

- **Flow:** Per project or per test, the "Allow healing" setting is off by default. When a locator fails at run time, the runner tries alternate locators already stored on the step (multi-signal, as Momentic does). If that fails and healing is allowed, it makes one bounded model call to pick a candidate from the current aria snapshot.
- **Rules:** A healed run is reported as **`passed (healed)`**, never plain `passed`. The healed locator is **proposed** as a change to the test definition for human approval, not written silently. Every heal is logged (old locator, new locator, evidence, model, cost). Healing never applies to assertions, so a heal can't make a real failure pass.
- **Where:** The runner only, with the model call going through a backend internal endpoint so keys stay in the backend. It adds latency and a non-deterministic step, which is why it is opt-in.
- **Acceptance:** With healing off, behaviour is identical to today. A healed run cannot be counted as a CI pass unless the project opts in to that as well.

### 8. Autonomous exploration and a runtime AI step type. Not recommended

An agent that crawls the app and writes or saves tests, or a `ai("…")` step interpreted at every run. Both break determinism and reviewability, and the vendors that lead with this (Octomind) did not survive. Revisit only as a separate "E2E Journey" or exploratory feature with its own ADR.

## 6. Architecture sketch

```
frontend ──► FastAPI router (ai_assist) ──► AiAssistService ──► integrations/llm/LlmClient (interface)
                                              │                     ├─ AnthropicLlmClient
                                              │                     └─ FakeLlmClient (tests)
                                              ├─ MaskingPipeline
                                              ├─ PromptRegistry (versioned)
                                              ├─ UsageRepository (cost caps, telemetry)
                                              └─ queue ──► runner (compile / dry-run / heal jobs)
```

- **`integrations/llm/`**: a small interface such as `complete_structured(prompt_id, version, inputs, schema) -> (obj, usage)`. It is provider-swappable, like the queue, storage and secrets adapters. Settings come from `app/config.py` (`LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`, `LLM_ENABLED=false` by default).
- **Structured outputs bound to our schema**: the response schema is generated from the same Pydantic step/assertion models the API uses (constrained JSON output / strict tool use). It is validated again server-side, and anything not in the allowlist of step and assertion types is rejected.
- **Prompt and version storage**: prompts live in the repo (`app/integrations/llm/prompts/<id>/v<n>.md`). The prompt id, version and model are stored on every suggestion, so results can be reproduced and compared.
- **Cost caps**: per-workspace monthly token budget, per-request `max_tokens`, rate limit per user, and a hard per-call input size limit (truncate snapshots and never send full HTML). Healing has its own cap per run.
- **Masking pipeline** (applied before every call): drop cookies, headers and storageState. Replace fill values and Test Data with tokens. Redact emails, phone numbers, card-like numbers, JWT/API-key patterns and URL query strings. Strip `value` attributes from snapshots. Screenshots are off by default. When enabled per project, mask input regions first (Playwright `mask` option). Seeded-secret tests assert that nothing leaks. Secrets from Auth Profiles never enter this path.
- **Human review**: every AI output is shown as a diff against the current definition. Nothing is persisted until the user accepts. Accepted items carry `source: ai_suggested`, plus `prompt_id/version` and `accepted_by`, through a migration that adds a provenance column on steps and assertions.
- **Telemetry**: structured log events (`ai.suggest.requested/returned/accepted/rejected`) with request ID, workspace, prompt version, tokens, latency and acceptance rate. No prompt or response bodies in logs. Acceptance rate per prompt version is the main quality metric.
- **Provider and data agreement**: use a provider with zero/limited retention terms where available, and document which data leaves the stack. Self-hosted or local deployments need a way to turn it off (`LLM_ENABLED=false`).
- **Capability registry (ADR-010)**: AI-assist is an authoring service, not a capability. It must not add step types. If healing is built, it is a runner hook registered through the capability model, not an engine fork.

## 7. Build vs buy, and the first steps

**Build, thinly, on an LLM API.** Don't adopt an agent framework or a commercial product.

- Every commercial tool owns its own step format and runner, which conflicts with ADR-002 and ADR-008. None offers a "clean my steps / suggest assertions for my schema" API we could call.
- The open-source agents (Browser Use, Midscene, Skyvern, Shortest) put the model on the replay path. workflow-use and Skyvern are AGPL.
- What we need is a schema-constrained design-time call plus our own review UI. That is small, and it is the part that sets us apart.
- **Borrow patterns:** Stagehand/Momentic caching and Autify's ask-before-fix for capability 7, and Playwright Test Agents' plan → generate → heal split for 4 and 5.
- **Model:** start with one mid-tier model with structured outputs, e.g. Claude Sonnet 5.5 ($2/$10 per M tokens at time of writing). Keep the adapter so we can swap provider or model. A suggestion call is a few thousand tokens, roughly a cent each. Budget caps matter more than per-call price.

**When scheduled, do these first:**

1. **Capability 0, structured step capture (M, no AI).** It is needed regardless of AI because ADR-002 requires it. Pin the recorder's Playwright version and enable codegen's auto-assertions.
2. **Capability 1 + 2 together, "Tidy steps" and "Suggest assertions" (M).** Ship them behind `LLM_ENABLED`, with the adapter, masking, diff review, provenance and telemetry from §6. Success metric: at least 50% suggestion acceptance and a measurable drop in time from record to saved test.

Capability 3 (failure explanation) is the natural third step once artifacts are stable.

## 8. Do not, risks, open questions

**Do not**

- Put an LLM or agent call on the default replay path, or let a run "pass" because the AI decided it was fine.
- Launch browsers or agents from FastAPI for any AI feature. Grounding, dry-runs and heals are runner jobs.
- Save AI output without human review, or let the model invent locators or step types outside the schema.
- Send credentials, storageState, cookies, raw fill values or unmasked screenshots to a provider.
- Adopt AGPL components (workflow-use, Skyvern) into the product, or a vendor's proprietary step format.
- Let a heal modify assertions.

**Risks**

- *Hallucinated locators / false confidence.* Mitigated by choosing from captured candidates and requiring a dry-run before save.
- *Data leakage* to the model provider. Mitigated by masking, screenshots off by default, a per-project kill switch and retention terms.
- *Cost creep* from triage on every failure or healing in CI. Mitigated by on-demand triggers and budgets.
- *Silent drift* from healing that masks real regressions. Mitigated by keeping it off by default, the `passed (healed)` status and an approval queue.
- *Vendor churn* (Octomind closed, ZeroStep gone). Mitigated by the provider adapter and our own format.
- *Prerequisite debt:* without capability 0 none of this is safe. Today's script-based storage is the biggest blocker.

**Open questions**

1. Which provider and data-processing terms are acceptable for customer apps under test, and do we need a self-hosted model option?
2. Should Arrange steps that come from an Auth Profile (ADR-018) ever be visible to the AI features? Proposed: no.
3. Where do aria snapshots get captured: the host recorder during recording, or a runner dry-run after?
4. Is `passed (healed)` a new TestRun status (needs a migration and an ADR-012 contract change) or metadata on `passed`?
5. Who owns prompt evaluation, and what is the regression eval set (recorded fixtures + expected steps)?

## Open item: AI-generated test plans (not planned yet)

Status: idea captured 8 Oct 2026, deliberately left open for proper planning. Nothing is built.

What prompted it: a whole Evolv plan (7 suites, 28 cases with Arrange/Act/Assert, assertions, start paths and auth profile) was produced by an AI from existing recordings and screenshots, then created with one import. The team wants that loop as a product feature.

Shape so far:
- **Generate** a plan in the Import test plan format (`tools/test-plans/*.json`, the `test-plans` API on branch `feat/test-plan-import`), then **review and apply** it through the existing Import flow (preview with checkboxes, nothing created without review). Recording still captures the steps.
- Two possible sources: (1) from text the team already has (user story, acceptance criteria, feature description, existing tests): a single design-time LLM call in the backend; (2) from the live app: a planner agent (Playwright Test Agents' planner pattern) exploring through the runner with an auth profile, never in FastAPI.

To plan before building: which source first, prompt and output schema, masking of page content, cost per plan, quality bar and how to measure it, and how it fits ADR-002 (structured steps) and ADR-018 (sign-in).

## 9. Sources

Checked 8 Oct 2026. Repo stars, licenses and last activity come from the GitHub API on that date.

- Playwright Test Agents — https://playwright.dev/docs/test-agents
- Playwright release notes (1.50 aria snapshots, 1.55 auto `toBeVisible`, 1.56 agents, 1.59 CLI, 1.64 bundled MCP/CLI) — https://playwright.dev/docs/release-notes
- Playwright MCP — https://github.com/microsoft/playwright-mcp
- Chrome DevTools MCP — https://github.com/ChromeDevTools/chrome-devtools-mcp, https://addyosmani.com/blog/devtools-mcp/
- Stagehand v4 — https://www.browserbase.com/changelog/stagehand-v4 ; caching — https://docs.stagehand.dev/v4/best-practices/caching ; repo — https://github.com/browserbase/stagehand
- Browser Use — https://github.com/browser-use/browser-use ; pricing — https://browser-use.com/pricing.md
- workflow-use — https://github.com/browser-use/workflow-use
- Midscene.js — https://github.com/web-infra-dev/midscene, https://midscenejs.com/introduction
- Skyvern — https://github.com/Skyvern-AI/skyvern, https://skyvern.com/blog/skyvern-changelog-june-2026
- Shortest — https://github.com/antiwork/shortest
- Auto Playwright — https://github.com/lucgagan/auto-playwright
- LaVague — https://github.com/lavague-ai/LaVague
- ZeroStep launch — https://www.ycombinator.com/launches/JnZ-zerostep-ai-assisted-actions-and-assertions-for-playwright-tests
- Anthropic `webapp-testing` skill — https://github.com/anthropics/skills/tree/main/skills/webapp-testing
- Claude computer use tool — https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
- Claude in Chrome release notes — https://support.claude.com/en/articles/12306336-claude-in-chrome-release-notes
- QA Wolf — https://www.qawolf.com/ai
- mabl auto-heal — https://help.mabl.com/changelog/early-access-for-advanced-auto-heal
- Momentic step cache — https://momentic.ai/docs/reliability/step-cache.md
- Applitools — https://applitools.com/platform-overview/
- Autify Nexus — https://autify.com/products/autify-nexus, https://autify.com/blog/autify-nexus-is-live
- BrowserStack AI agents — https://www.browserstack.com/press/browserstack-launches-suite-of-ai-agents-to-redefine-software-quality-at-scale
- Testim locators — https://www.tricentis.com/blog/testim-locator-technologies
- SmartBear acquires Reflect — https://smartbear.com/news/news-releases/smartbear-acquires-reflect/
- LambdaTest → TestMu AI — https://kyodonewsprwire.jp/release/202601122288

**Unverified or third-party only**

- Octomind shutdown dates (farewell letter 23 Apr 2026, service off end of May 2026). Source: rywalker.com and qaskills.sh. Consistent with `octomind.dev` not resolving on 8 Oct 2026.
- Claude in Chrome GA date (26 Aug 2026). Source: Gigazine.
- mabl "Active Coverage" (Apr 2026). Source: qaskills.sh.
- Applitools "no LLMs at runtime" wording. Source: a search summary of applitools.com pages; the exact page was not fetched.
- KaneAI export targets, Checksum and testRigor feature claims. Sources: aggregator sites.
- ZeroStep current status: the repo returns 404. Assumed discontinued.
- Whether Shortest caches resolved actions to avoid model calls on replay: not confirmed in its README.
- Effort estimates and per-call cost are our own rough estimates.
