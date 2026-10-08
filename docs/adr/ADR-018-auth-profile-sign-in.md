# ADR-018 — How Auth Profiles sign in to the application under test

Status: Proposed
Date: 2026-10-08
Refines: ADR-004 (hybrid auth profiles)
Constrained by: ADR-002 (structured definitions), ADR-003 (recording-first), ADR-008 (runner boundary),
ADR-010 (capability registry), ADR-011 (Electron), ADR-012 (run API / status model)

> Numbering: the brief asked for `ADR-013-auth-profile-sign-in.md`, but ADR-013 to ADR-017 are
> already taken (`ADR-013-two-tier-execution.md` etc.), so this is ADR-018.

## The question

A tester asked: *"Why do I record a login when I already have the credentials?"*

Short answer: you shouldn't have to. Recording a **session** should be the fallback for logins a
machine can't do (captcha, push or SMS MFA, IdPs that block bots). Every other login should be
done by the runner, unattended, whenever the saved session is missing or expired. This ADR sets
out how that works, how the tester picks a sign-in method per profile, and what happens when it
fails.

---

## 1. Context: what exists today

### Data

`supabase/migrations/20261006_auth_profiles.sql:5-14` defines `auth_profiles(id text, project_id,
name, login_url, refresh jsonb, credentials_enc text, storage_state_enc text, created_at)`. Both
`*_enc` columns hold Fernet tokens under `TESTFLOW_SECRET_KEY` (`docs/AUTH_PROFILE_REKEY.md`). The
table has no `updated_at` and uses a text id (`auth-<epoch-ms>`), unlike the UUID and
`created_at`/`updated_at` conventions in CLAUDE.md.

### Authoring

- **Record Login**: `POST /projects/{id}/auth-profiles/{pid}/record` (`backend/app/routers/auth_profiles.py:68-74`)
  → `AuthProfilesService.record_login` (`backend/app/services/auth_profiles_service.py:95-105`)
  → `record_auth_profile_login` (`backend/app/services/automation_service.py:222-240`), which either
  delegates to the host recorder (`backend/host_recorder_main.py:80-98`) or runs codegen inside the
  API process (`automation_service.py:205-219`).
- `PlaywrightRecorder.record_storage_state` (`automation/framework/recorder.py:124-179`) runs
  `playwright codegen --save-storage` only (`:144-148`). **The actions the tester performs while
  logging in are thrown away. Only the resulting cookies and localStorage are kept.** This is why
  a recorded login cannot be replayed: nothing replayable was saved.
- Credentials: `PUT .../credentials` stores `{username, password}` encrypted
  (`auth_profiles_service.py:59-71`). The summary returns the **username** in clear
  (`backend/app/schemas/auth_profile.py:41`, `auth_profile_repository.py:298-300`). The password is
  never returned.
- Refresh config (cookie or localStorage token refresh) is non-secret jsonb (`schemas/auth_profile.py:11-25`).
- Session status (`none | active | expiring | expired`) comes from the latest cookie expiry, with a
  24 h "expiring" window and a 7-day cap for session-only cookies (`auth_profile_repository.py:23-26, 316-351`).

### Run time (worker, ADR-004 flow)

`worker/src/runTest.ts:125-143` calls `ensureAuthenticatedSession`
(`worker/src/authProfiles.ts:171-204`):

1. If a session exists, open the test's first URL in a fresh context. If no login screen shows,
   reuse the session (`:179-182, 228-244`).
2. Otherwise, if refresh is configured, refresh and revalidate (`:184-190, 252-325`).
3. Otherwise, if credentials exist, call `loginWithCredentials` (`:346-398`).
4. Save the new state encrypted if it changed (`runTest.ts:136`, `authProfiles.ts:143-164`). Any
   `AuthProfileError` becomes `Test not started: …` (`runTest.ts:140`).

### What breaks, and why

| # | Failure | Cause (file:line) |
|---|---|---|
| B1 | **Two-step logins** (email → Next → password: Google, Microsoft, Okta, Auth0 Universal Login) | `loginWithCredentials` requires `input[type=password]` on the first page and throws "No password field was found" (`authProfiles.ts:361-364`). |
| B2 | **SSO / OAuth redirects** | The username heuristic (`:40-47`) and submit heuristic (`:48-54`) are tuned for a single form on the app's own origin. After submit the code waits for `networkidle` and jumps straight to the target (`:386-387`), so it never follows a multi-hop IdP redirect chain to the end. |
| B3 | **False "session is valid"** | `landedOnLogin` (`:216-226`) only checks for a `/login` path or a visible password field. The first page of a two-step or SSO login (for example `/u/login/identifier` or `login.microsoftonline.com/...`) has neither, so an **expired session is reported as valid**. The test then fails inside its own steps with a misleading error. |
| B4 | **MFA** (TOTP, SMS, email, push) | Not modelled. Any second factor leaves the browser on a challenge page. |
| B5 | **Captcha / bot detection** | Not detected. Shows up as "credentials did not produce an authenticated session" (`:388-392`), which wrongly blames the credentials. |
| B6 | **Rejected credentials are not distinguished** from "the page didn't behave as expected" | No error-text capture. Every failure reads "Check the credentials" (`:389-391`). |
| B7 | **Thundering herd and account lockout** | `WORKER_CONCURRENCY` defaults to 3 per worker (`worker/src/index.ts:26`), and a suite fans out to many jobs. Every job that sees an expired session signs in on its own, then each one overwrites `storage_state_enc` (last write wins, `authProfiles.ts:158-162`). Five parallel tests mean five logins. With bad credentials that is five failures a minute, enough to lock many test accounts. There is no failure counter or backoff. |
| B8 | **Sign-in time is not bounded properly** | The test timer runs during sign-in (`runTest.ts:100-103`), but it only closes the *test* context, which is still `null` at that point (`:97-99`). A hung sign-in runs until each navigation's own 30 s timeout (`authProfiles.ts:55`) and is then reported as `Timed out after …`, not `Test not started`. |
| B9 | **Environment mismatch** | The test URL is retargeted to the selected Environment (`runTest.ts:77-86`), but `login_url` is absolute and is not. A Staging run can sign in against a Production login page. |
| B10 | **Validation costs a full page load per test** | Every job navigates and waits up to 8 s for `networkidle` plus a fixed 1.5 s (`authProfiles.ts:217-218`), even when a sibling job validated the same session seconds earlier. |

Duplicate implementation: `automation/framework/auth_session.py:155-228` holds the same single-form
heuristic in Python, for the legacy pytest framework. It should not grow in parallel. The worker is
the only place sign-in evolves.

Divergences from the accepted ADRs that this design must not make worse:

- **ADR-002.** Recorded tests are stored and replayed as **source code**. Codegen Python is
  translated line by line (`worker/src/playback.ts:23-74`) and run with `new Function`
  (`runTest.ts:175-187`). That is not a structured definition.
- **ADR-008.** Without `RECORDING_DELEGATE_URL`, the API process launches Chromium
  (`automation_service.py:56-70, 205-219`). The worker also reads `auth_profiles` straight from
  Supabase with the service role (`authProfiles.ts:86-105`) rather than through an internal API.
- **ADR-005.** The job payload carries `configPath` and other fields (`backend/app/queue/job_store.py:42-78`),
  not just `{ run_id }`. It carries no secrets, and this ADR keeps it that way.

---

## 2. Sign-in methods evaluated

All methods share the same ADR-004 frame: restore → validate → (refresh) → **sign in** → save →
run. They differ only in how the "sign in" box works.

### a) Saved session only (recorded manually)

- **How:** what exists today. Codegen opens headful on the tester's machine, the tester logs in,
  and `--save-storage` captures the session, which is stored encrypted.
- **Handles:** everything a human can do, including SSO, any MFA, captcha and device trust prompts.
- **Fails when:** the session expires (often 1 to 24 h for IdP sessions, up to 7 days for app
  cookies). Every expiry needs a human. Sessions can also be revoked server-side (password change,
  "sign out everywhere", IP binding), which only shows up at run time.
- **Secrets:** only `storage_state_enc`. No credentials needed. This is the smallest secret surface.
- **Effort:** none, already built.
- **Verdict:** keep as the explicit `session_only` method for logins that cannot be automated. It
  should never be the default when credentials exist.

### b) Smart form login (heuristic, extended to multi-step)

- **How:** a loop with at most 4 screens, each with a per-screen timeout:
  1. Open `login_url`, resolved against the run's Environment (fixes B9, see section 5).
  2. On each screen:
     - If a visible identifier field exists and has not been filled, fill `{{username}}`.
     - If a visible password field exists, fill `{{password}}`.
     - If a visible one-time-code field exists (`autocomplete=one-time-code`, or name/id matching
       `otp|totp|code|mfa`, or `inputmode=numeric` with `maxlength` 6–8) and TOTP is configured,
       fill `{{totp}}`.
     - Then click the primary action, in this priority order: a configured override, then
       `button[type=submit]`, then a button/link whose accessible name matches
       `/^(next|continue|sign in|log in|login|submit|verify)$/i`, then press Enter on the last
       field filled.
  3. Wait for one of these: a URL change, a new visible field, an error message, or the success check.
  4. Stop when the success check passes, an error is detected, or no progress is made on a screen.
- **Overrides:** optional `form_selectors` jsonb with `{ username, password, submit, next, otp }`.
  Each is a CSS or `role=name` locator. Each override replaces only its own heuristic, so a tester
  can fix one bad guess without recording.
- **Success check** (also used for session validation, fixing B3): one of
  `{ type: "url_matches", pattern }` (glob on path or full URL), `{ type: "element_visible", locator }`,
  or `{ type: "url_not_matches", pattern }`. It is evaluated on the test's target URL. Default when
  unset: the current heuristic, plus "the final URL host is not the target host" (an SSO bounce) and
  "an identifier-only login form is visible".
- **Error detection:** after each submit, look for `[role=alert]`, `[aria-live=assertive]`,
  `.error, .invalid-feedback`, or visible text matching
  `/invalid|incorrect|wrong|not recognised|locked|try again/i` near the form. Capture up to 200 chars,
  passed through the redactor (section 8). Optional `failure_check` locator per profile.
- **Detects and names, rather than retries:** captcha (an iframe whose `src` matches
  `recaptcha|hcaptcha|challenges.cloudflare|turnstile|arkoselabs`), and MFA challenges without TOTP
  (code field visible, TOTP not configured; or text like "approve on your phone").
- **Handles:** single-page forms, the common two-step forms, and simple SSO hops whose IdP pages
  follow the same patterns (Okta, Auth0, Keycloak and Entra ID mostly do).
- **Fails on:** custom widgets (React selects as the "username", shadow DOM forms), account pickers
  ("Pick an account"), "Stay signed in?" interstitials, and any captcha. A heuristic can't be proven
  right in advance, so it needs a **Test sign-in** button (section 4).
- **Secrets:** `credentials_enc`, plus `totp_enc` if used.
- **Effort:** M.
- **Verdict:** the **default** method. It answers the tester's question directly: type the
  credentials, click Test sign-in, done.

### c) Recorded login flow with placeholders

- **How it is recorded:**
  1. The tester saves credentials (and the TOTP seed, if any) on the profile **first**. The record
     button is disabled until they exist.
  2. `POST .../record-flow` uses the existing host-recorder delegation (`automation_service._post_to_delegate`)
     to call a new host endpoint, `/record-login-flow`. It runs the same `PlaywrightRecorder` with
     **both** `--save-storage` and `--output` (the same codegen machinery as Record Test,
     `automation_service.py:78-99`). Both files go to a private `0600` temp path, the pattern
     already used for session files (`docs/AUTH_PROFILE_REKEY.md`, "Key handling").
  3. The tester logs in **with the stored credentials**. Codegen writes, for example,
     `page.get_by_label("Password").fill("hunter2")`. **This temp file contains the real password,
     so it is deleted in a `finally` block before the request returns, on success or failure.**
  4. The backend parses the codegen output into structured steps (below). For each `fill` step, it
     compares the literal value with the decrypted credentials in memory:
     - Equal to the username → `{{username}}`.
     - Equal to the password → `{{password}}`.
     - A 6–8 digit value equal to the TOTP code for any 30 s window within ±10 minutes of the
       recording → `{{totp}}`.
  5. **Residual-secret guard.** After substitution, serialise the flow and reject it with
     400 *"The recording contains the password outside a field the recorder understood. Record again
     without pasting the password into other fields."* if any of these appears anywhere in it: the
     password, the username, or any TOTP code from step 4. Example: a password typed into the URL
     bar or a `press` sequence. Nothing is saved in that case.
  6. If the password placeholder was never produced, reject with 400 *"The password you typed while
     recording did not match the one saved on this profile. Update the saved password or record
     again."* This catches the "typed a different password" case without ever echoing either value.
  7. Persist `login_flow` (non-secret jsonb). The captured storage state goes into
     `storage_state_enc` in the same request, so the profile is immediately **Active**.
- **Structured steps (ADR-002), not source:** the flow is a list from the ADR-003 step vocabulary
  (Navigate, Click, Fill, Select, Press Key, Wait) with codegen's locator kept as data:

  ```json
  { "version": 1,
    "steps": [
      { "type": "navigate", "url": "/u/login" },
      { "type": "fill",  "locator": { "kind": "label", "value": "Email address" }, "value": "{{username}}" },
      { "type": "click", "locator": { "kind": "role", "role": "button", "name": "Continue" } },
      { "type": "fill",  "locator": { "kind": "label", "value": "Password" }, "value": "{{password}}" },
      { "type": "click", "locator": { "kind": "role", "role": "button", "name": "Continue" } }
    ] }
  ```

  The parser accepts the codegen forms `playback.ts` already understands (`get_by_role`,
  `get_by_label`, `get_by_placeholder`, `get_by_text`, `locator(css)`, `.fill/.click/.press/.check/.select_option`,
  `page.goto`). That way there is **one** codegen grammar in the product, not two. A line it cannot
  parse fails the recording with that line number shown, with secrets redacted. `goto` URLs are
  stored as path plus query when the host matches the profile's login origin, and absolute otherwise
  (IdP hosts), so environment retargeting works for the app half of the flow.
- **Why not reuse `new Function` playback directly:** substituting a password into JavaScript
  source is **code injection**. A password containing `");` breaks out of the string. The flow is
  run by a small allowlisted step executor in the worker. Placeholders are resolved to *values*
  passed into `locator.fill(value)`, never spliced into text. This executor is the first piece of
  the ADR-002 step model. Test cases can later move onto it, which retires the `new Function` path.
- **Replay** (worker, headless): open a fresh context, run the steps with a per-step timeout, then
  evaluate the profile's success check on the target URL. Error detection from b) runs after each
  click step, so a rejected password reads as "rejected", not "element not found".
- **Handles:** anything deterministic, including custom widgets, account pickers, "Stay signed in?",
  multi-hop SSO and consent screens. Combined with d), it also handles TOTP MFA.
- **Fails on:** captcha, push/SMS MFA, UI changes to the login page (the same brittleness as any
  recorded test, with the same fix: record again), and IdP bot detection (see f).
- **Secrets:** `credentials_enc`, plus `totp_enc` if used. `login_flow` holds placeholders only, and
  the guard in step 5 enforces that.
- **Effort:** L (host endpoint, parser, substitution and guard, executor, masking).
- **Verdict:** the method for logins b) can't handle. The UI should suggest it when b) fails in a
  recognisable way (section 4).

### d) TOTP MFA

- **How:** optional `totp_enc` holds the Fernet-encrypted `{ secret (base32), digits (6), period (30), algorithm (SHA1) }`.
  It is entered as a base32 secret or an `otpauth://` URI (from the "can't scan the QR code?" link).
  The worker generates the code with `node:crypto` HMAC per RFC 6238 (about 30 lines, no
  dependency). If fewer than 5 s are left in the current window, it waits for the next one so the
  code doesn't expire mid-submit.
- **Setup check:** `PUT .../totp` takes `{ secret | otpauthUri, verifyCode }`. The tester types the
  code their authenticator shows, and the backend accepts only if it matches the current window
  ±1. This proves the seed is correct without the API ever **returning** a live code.
- **Used by:** b) (fills a detected OTP field) and c) (`{{totp}}` placeholder).
- **Cannot automate:** SMS OTP, email OTP and push approval (Okta Verify, Microsoft Authenticator
  number matching). These would need an inbox or SMS API and are out of scope for the MVP.
  Recommendation to teams: **give test accounts TOTP as their only factor**, or exempt them from MFA
  by IdP policy (a conditional-access exclusion for a test group), or fall back to a).
- **Note:** some IdPs reject reuse of the same code within its window. The per-profile lock
  (section 7) means only one sign-in per profile runs at a time, which avoids this.
- **Effort:** S.

### e) API / token login

- **How:** `api_login` jsonb, non-secret, for example
  `{ url, method: "POST", contentType: "json" | "form", body: { "email": "{{username}}", "password": "{{password}}" }, capture }`, where `capture` is one of:
  - `{ type: "cookies" }`: send the request with `context.request`, which shares the context's
    cookie jar, so `Set-Cookie` lands in the storage state. This is the same mechanism as the cookie
    refresh at `authProfiles.ts:287-292`.
  - `{ type: "localStorage", origin, entries: [{ key, jsonPath }] }`: read token(s) from the JSON
    response and write them to localStorage. This is the same code as the localStorage refresh at
    `authProfiles.ts:294-324`, and it should be shared, not copied.
- **Relation to refresh:** refresh renews an *existing* session using a token already in it. API
  login creates a session from credentials. They compose: try refresh first, then API login.
- **Handles:** SPAs with a JSON login endpoint. It is fast (no page load) and stable (no selectors).
- **Fails on:** CSRF-protected form posts (needs a preliminary GET to read a token: an open question),
  SSO (the endpoint is the IdP's), and anything requiring a browser fingerprint. A body template may
  only contain placeholders for secret fields; the same residual-secret guard applies on save.
- **Effort:** M.

### f) SSO / OAuth

SSO is not a separate method. It is a **route** through b), c) or a):

- **Works with c)** when the IdP test account has no MFA and no captcha. Works with **c) + d)** when
  its only factor is TOTP. b) sometimes works too: the multi-step loop follows IdP pages that use
  standard forms.
- **IdP bot detection.** Google, and Microsoft with risk-based policies, often refuse or challenge
  logins from headless Chromium, datacentre IPs, or a "new device" every time. A fresh context has
  no device cookie. Mitigations, in order:
  1. Use an IdP test tenant or test policy without risk-based challenges.
  2. Rely on the long-lived refresh behaviour of the saved session (a, plus refresh).
  3. Use `session_only` recorded **headful on the host**. That is a real desktop browser on a
     residential IP that a human just used, which IdPs trust more, and it is why recording stays
     on the host recorder rather than in the runner container.
- **Don't** try to defeat bot detection (stealth plugins, user-agent spoofing). It is brittle, may
  breach the IdP's terms, and is out of MVP scope.

---

## 3. Decision

### 3.1 Model

Each Auth Profile has exactly one **`sign_in_method`**:

| Method | Needs | Default when |
|---|---|---|
| `form` | credentials | **default** for new profiles |
| `recorded_flow` | credentials + `login_flow` | the tester recorded a flow |
| `api` | credentials + `api_login` | the tester configured it |
| `session_only` | a recorded session | the tester chose it, or a migrated profile has a session but no credentials |

Orthogonal options, valid with every method except `session_only`:

- **TOTP** (`totp_enc`).
- **Refresh** (existing `refresh` jsonb). It always runs before sign-in, for any method including
  `session_only`.
- **Success check** (`success_check`). Used for session validation by **every** method, including
  `session_only`.

The saved session is always kept and always tried first. A method only says how to get a new one.

### 3.2 Run-time order (worker, per job)

```
0. Profile paused (sign_in_paused_until > now)?  → Test not started (P)
1. Session present and validated (success check, or the 120 s validation cache) → reuse
2. Refresh configured → refresh → validate → reuse
3. Acquire per-profile lock (section 7). If another job just refreshed the session → reload, validate → reuse
4. Run sign_in_method → validate with the success check
5. Save storage_state_enc, set last_sign_in_* fields, reset the failure count, release the lock → run the test
   On failure: increment sign_in_failures, maybe pause, release the lock → Test not started
```

### 3.3 "Test not started" messages (exact wording)

All of them start with `Test not started: `. `{name}` is the profile name. Error text from the page
is truncated to 200 chars and redacted.

| Code | Message |
|---|---|
| `no_session_no_method` | `The Auth Profile "{name}" has no saved session and no way to sign in. Add credentials or record a session.` |
| `session_expired_manual` | `The saved session for "{name}" has expired and this profile signs in manually. Record the session again.` |
| `missing_credentials` | `The Auth Profile "{name}" uses {method} sign-in but has no saved credentials.` |
| `missing_flow` | `The Auth Profile "{name}" uses a recorded sign-in flow, but none has been recorded.` |
| `rejected` | `Sign-in for "{name}" was rejected by the application: "{page error}".` |
| `field_not_found` | `Sign-in for "{name}" could not find the {username\|password\|next button\|code} field on {host}{path}. Set a selector override or record the sign-in flow.` |
| `step_failed` | `Sign-in for "{name}" failed at step {n} ({step label}): {reason}. The login page may have changed. Record the sign-in flow again.` |
| `success_check_failed` | `Sign-in for "{name}" finished, but the success check ({check}) did not pass on {target}.` |
| `mfa_required` | `Sign-in for "{name}" reached a multi-factor prompt and no TOTP secret is configured. Add a TOTP secret or use a saved session.` |
| `mfa_unsupported` | `Sign-in for "{name}" needs push, SMS or email approval, which cannot be automated. Use a saved session.` |
| `captcha` | `Sign-in for "{name}" was blocked by a captcha. Use a saved session for this application.` |
| `timeout` | `Sign-in for "{name}" did not finish within {s} s.` |
| `lock_timeout` | `Another test was signing in to "{name}" and did not finish within {s} s.` |
| `paused` (P) | `Automatic sign-in for "{name}" is paused until {time} after {n} failed attempts (last error: {last}). Fix the profile and use Test sign-in to resume.` |
| `decrypt` | existing message, `authProfiles.ts:80` |
| `secret_key` | existing message, `fernet.ts:16-22` |

The machine code is stored in `last_sign_in_outcome` and on the TestRun as the "not started"
reason. That gives ADR-012's `has_errors` / infrastructure-error status a concrete value.

---

## 4. UX

### 4.1 Profile form

- **Name**, **Login URL** (path, or absolute for an external IdP; see 5.2).
- **Sign-in method**: a segmented control (the existing `Tabs` primitive in pill style):
  `Sign-in form` · `Recorded steps` · `API request` · `Manual session`. A one-line helper sits under
  each:
  - *Sign-in form:* "Attest fills your username and password, including two-step logins."
  - *Recorded steps:* "Record the login once. Attest replays it with the saved credentials."
  - *API request:* "Call your app's login endpoint and keep the cookies or token."
  - *Manual session:* "You sign in by hand. Use this for captcha or phone-approval logins. Sessions expire."
- **Credentials** (all methods except Manual): username, password (write-only; shows
  "Saved · updated {date} by {user}" with a Replace button, never a value).
- **Two-factor (TOTP)** (all except Manual), collapsed by default: secret or `otpauth://` URI, plus
  "Enter the current code from your authenticator". Saved state reads "Configured", with Remove.
- **Success check** (all methods): `URL matches` / `Element visible` / `URL does not match`, plus a
  value. A hint suggests the target URL's path.
- **Advanced** (`form` only): selector overrides for username, password, next, submit and code.
- **Recorded steps** (`recorded_flow`): a read-only step list (`Fill · Email address · {{username}}`),
  a **Record sign-in flow** button (disabled until credentials are saved, with a tooltip explaining
  why), and Delete flow.
- **API request** (`api`): URL, method, content type, body template (a key/value table whose values
  are restricted to placeholders or literals), and capture type.
- **Refresh**: the existing dialog (`ProjectAuthProfilesPage.tsx:208-241`) moves into this form as a
  collapsed "Session refresh" section.

### 4.2 Test sign-in

- A button on the profile row and in the form. It runs **one sign-in in the worker through the
  queue** (ADR-008; FastAPI only enqueues). It **ignores the saved session** (forces step 4 of 3.2),
  and on success **saves the new session**, so Test sign-in also works as "renew now".
- The result drawer polls the job and shows steps: `Open login page` → `Fill username` → `Continue`
  → `Fill password` → `Sign in` → `Success check`. Each step shows a status and duration, and the
  failing step shows its screenshot and the coded message from 3.3.
- **Screenshots never show typed secrets:**
  - Every screenshot in a sign-in context uses Playwright's `mask` option, listing every locator
    filled with `{{password}}` or `{{totp}}`, and every `input[type=password]`. Masking the locator
    that was filled, not just `type=password`, covers "show password" toggles.
  - Screenshots are taken only **after** a fill completes, never mid-typing, and never of the
    browser URL bar (page screenshots only).
  - **No Playwright trace is recorded in the sign-in context, ever.** Traces include
    `fill(...)` arguments and network bodies. When trace-on-failure lands for tests (MVP
    checkpoint), tracing starts on the *test* context, which is created after sign-in, so the
    boundary is structural.
  - Sign-in screenshots go to `results/{jobId}/signin-step-NN.png`, kept separate from test steps,
    and are kept only for Test sign-in jobs and failed runs.
- Test sign-in **bypasses a pause** (it is a deliberate human action) but still counts towards the
  failure count. Success clears the pause.

### 4.3 Session status

The badge combines session state and sign-in health:

| Badge | Condition |
|---|---|
| **Active** (green) | session valid and not expiring |
| **Expiring** (amber) | within 24 h of expiry. Subtext for auto methods: "Renews automatically" |
| **Expired** (neutral for auto methods, red for Manual) | session past expiry. Auto: "Signs in on next run" |
| **Needs attention** (red) | `last_sign_in_outcome` is a failure, or paused. Subtext: the coded message |
| **No session** | none saved and never signed in |

This changes today's `needsRenewal` (`auth_profile_repository.py:377`). An expired session on an
automatic profile is normal, not a call to action. The renewal banner
(`ProjectAuthProfilesPage.tsx:258`) should count only `session_only` profiles that are
expiring or expired, plus any profile that needs attention.

### 4.4 When to suggest another method

Shown in the Test sign-in result or the Needs attention subtext, with a one-click switch:

| Outcome | Suggestion |
|---|---|
| `field_not_found`, or no progress on a screen (`form`) | "Record the sign-in flow instead" |
| final URL host ≠ target host (SSO bounce) with `form` | "This app signs in through {idp host}. Recording the flow usually works better." |
| `mfa_required` | "Add a TOTP secret" (+ link to the MFA guidance) |
| `mfa_unsupported`, `captcha` | "Switch to Manual session" |
| `step_failed` (`recorded_flow`) | "The login page changed. Record the flow again." |

---

## 5. Data model and migration

### 5.1 Migration `supabase/migrations/20261009_auth_profile_sign_in.sql` (additive)

```sql
alter table public.auth_profiles
  add column if not exists sign_in_method text not null default 'form'
    check (sign_in_method in ('form','recorded_flow','api','session_only')),
  add column if not exists login_flow jsonb,             -- structured steps, placeholders only
  add column if not exists form_selectors jsonb,         -- non-secret overrides
  add column if not exists success_check jsonb,          -- {type, pattern|locator}
  add column if not exists failure_check jsonb,          -- optional locator for the error banner
  add column if not exists api_login jsonb,              -- placeholders only
  add column if not exists totp_enc text,                -- Fernet, same key as credentials_enc
  add column if not exists session_saved_at timestamptz, -- when storage_state_enc was last written
  add column if not exists last_sign_in_at timestamptz,
  add column if not exists last_sign_in_outcome text,    -- 'ok' | code from 3.3
  add column if not exists last_sign_in_error text,      -- redacted, <= 300 chars
  add column if not exists sign_in_failures int not null default 0,
  add column if not exists sign_in_paused_until timestamptz,
  add column if not exists credentials_updated_at timestamptz,
  add column if not exists credentials_updated_by uuid,
  add column if not exists totp_updated_at timestamptz,
  add column if not exists totp_updated_by uuid,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid;

-- Preserve today's behaviour: a profile with a session but no credentials stays manual.
update public.auth_profiles
   set sign_in_method = 'session_only'
 where credentials_enc is null and storage_state_enc is not null;

create index if not exists auth_profiles_project_id_idx on public.auth_profiles(project_id);
```

Naming follows upstream: secrets end in `_enc` and are Fernet tokens under `TESTFLOW_SECRET_KEY`.
Everything else is non-secret. `scripts/rekey_auth_profiles.py` must add `totp_enc` to the fields
it re-keys. Demo mode (`USE_DEMO_DATA`, `authProfiles.ts:114-140`) stores the new non-secret fields
in `profile.json` and TOTP in `totp.enc`.

The text `id` and the enforced FK on `project_id` stay as they are. Changing them is a separate
migration, out of scope here.

### 5.2 Login URL and environments (B9)

`login_url` is interpreted like a recorded `goto`. If it is a path, or its host equals the
project's base-URL host, it is **retargeted to the run's Environment** with the same `retargetUrl`
(`playback.ts:4-8`). If it points at a different host (an IdP), it is used as is. Recorded flow
`navigate` steps follow the same rule. Whether one profile should span environments at all is open
question Q5.

---

## 6. API contract

All under `/api/projects/{projectId}/auth-profiles`. Errors are `{ "message": "..." }`, with 400 for
validation. **No response ever contains a password, TOTP secret or code, storage state, token, or
raw recorded source.**

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `` | — | `AuthProfileSummary[]` |
| POST | `` | `{ name, loginUrl?, signInMethod?, username?, password? }` | `AuthProfileSummary` (existing, extended) |
| PATCH | `/{id}` | `{ name?, loginUrl?, signInMethod?, successCheck?, failureCheck?, formSelectors?, apiLogin? }`, all non-secret | `AuthProfileSummary` |
| PUT | `/{id}/credentials` | `{ username, password }` (existing). Resets `sign_in_failures` and the pause | `AuthProfileSummary` |
| PUT | `/{id}/totp` | `{ secret?, otpauthUri?, verifyCode }` | `AuthProfileSummary`. 400 `"That code does not match. Check the secret and your device clock."` |
| DELETE | `/{id}/totp` | — | 204 |
| POST | `/{id}/sign-in-test` | `{ environmentId? }` | **202** `{ jobId, kind: "auth_sign_in" }` |
| POST | `/{id}/record-flow` | — | `AuthProfileSummary` (synchronous like today's `/record`; host recorder) |
| DELETE | `/{id}/login-flow` | — | 204 (method falls back to `form`) |
| POST | `/{id}/record` | — | existing: manual session capture |
| PUT | `/{id}/refresh` | existing | existing |

Validation (service layer): `signInMethod=recorded_flow` requires `login_flow`, and
`api` requires a valid `apiLogin`. The method can be saved before credentials exist, but the
summary then reports `signInReady: false` with a reason. Placeholders are limited to `{{username}}`,
`{{password}}` and `{{totp}}`.

`AuthProfileSummary` additions:

```jsonc
{
  "signInMethod": "form",
  "signInReady": true, "signInNotReadyReason": null,
  "hasCredentials": true, "username": "qa+admin@example.com", // see Q3
  "credentialsUpdatedAt": "…",
  "hasTotp": false,
  "loginFlow": { "stepCount": 5, "steps": [ { "type": "fill", "target": "Email address", "value": "{{username}}" } ] } | null,
  "successCheck": { "type": "url_matches", "pattern": "/dashboard*" } | null,
  "formSelectors": { … } | null,
  "apiLogin": { … } | null,          // placeholders only
  "sessionStatus": "active|expiring|expired|none",
  "health": "ok|needs_attention|paused",
  "lastSignInAt": "…", "lastSignInOutcome": "rejected", "lastSignInError": "…redacted…",
  "signInFailures": 2, "signInPausedUntil": null
}
```

**Polling Test sign-in:** `GET /api/executions/{jobId}` (existing, `routers/executions.py:100`)
gains `kind` and, for `auth_sign_in`:

```jsonc
{ "status": "completed|failed|running|queued",
  "signIn": { "outcome": "ok|<code>", "message": "Sign-in for … was rejected …",
              "steps": [ { "index": 1, "label": "Fill username", "status": "passed", "durationMs": 120, "screenshot": "results/<job>/signin-step-02.png" } ],
              "suggestion": "record_flow|add_totp|session_only|null" } }
```

**Job payload** (Redis, `job_store.submit_job`): adds `kind: "auth_sign_in"`, `projectId`,
`authProfileId` and `environmentBaseUrl`, with `configPath: null`. No secrets. The worker loads the
profile itself. `index.ts:runOne` branches on `kind`. A `test_run` job is unchanged.

---

## 7. Worker design

### 7.1 Where sign-in runs

- In `worker/src/authProfiles.ts`, before `runTest.ts` creates the test context (`:146`), as today.
- Sign-in always uses **its own fresh `BrowserContext`** (`withContext`, `authProfiles.ts:206-214`)
  with no tracing, closed in `finally`. The resulting `storageState` is passed by value into the
  test context. Nothing secret touches disk.
- Split the module as it grows: `authProfiles.ts` (load/save/orchestrate), `signIn/form.ts`,
  `signIn/flow.ts` (the step executor), `signIn/api.ts`, `totp.ts`, `redact.ts`. No new service.
- Electron (ADR-011): the same orchestration drives the renderer `Page`. Form and recorded flows
  work in the renderer. API and session restore cover renderer state only, which is the gap ADR-011
  already records.

### 7.2 Locking: one sign-in per profile at a time

Redis, same connection as the job store:

```
lock key:   testflow:auth:lock:{profileId}    SET NX PX 90000, value = jobId
fresh key:  testflow:auth:fresh:{profileId}   value = session_saved_at ISO, EX 600
valid key:  testflow:auth:valid:{profileId}   value = session_saved_at ISO, EX 120
```

1. Validate the loaded session. If `valid` equals this session's `session_saved_at`, skip the page
   load (fixes B10). On a successful page validation, set `valid`.
2. If invalid: `SET NX` the lock.
   - **Got it:** re-read `session_saved_at` from Supabase. If it is newer than what this job
     loaded, another job already signed in, so reload, validate and use it (double-checked). Else
     sign in, save, set `fresh`, and release with a compare-and-delete Lua script (only if the
     value is still our jobId).
   - **Didn't get it:** poll `fresh` every 1 s for up to the lock TTL. When it changes, reload the
     profile from Supabase and validate. On timeout → `lock_timeout`.
3. The lock TTL (90 s) is longer than the sign-in budget (60 s), so a crashed holder frees the lock
   automatically.
4. A worker shutdown mid-sign-in aborts the context. The job is released as today
   (`index.ts:109-115`), and the lock expires.

The result: five parallel tests sharing one profile produce one login and four reuses. The
last-write-wins overwrite (B7) also goes away, because only the lock holder writes.

### 7.3 Lockout protection

- On failure: `sign_in_failures += 1`, and set `last_sign_in_outcome` / `last_sign_in_error`.
- At **3** consecutive failures of type `rejected`, `success_check_failed`, `captcha` or
  `mfa_*`, set `sign_in_paused_until = now + 15 min`. Repeat pauses back off 15 min → 1 h → 4 h.
  Infrastructure failures (`timeout` with navigation errors, `lock_timeout`) count towards the
  failure total but do not pause, because they say nothing about the account.
- While paused, jobs fail instantly with `paused` and make **zero** requests to the app.
- Reset on any successful sign-in, on `PUT credentials`/`totp`, or on a `sign_in_method` change.
- These counters live in Postgres (not Redis) so the UI can show them and they survive restarts.

### 7.4 Timeouts

| Budget | Default | Env var |
|---|---|---|
| Whole sign-in (all screens / steps) | 60 s | `AUTH_SIGN_IN_TIMEOUT_MS` |
| Per screen (form) / per step (flow) | 15 s | `AUTH_STEP_TIMEOUT_MS` |
| Session validation | 20 s | `AUTH_VALIDATE_TIMEOUT_MS` |
| Lock wait | lock TTL (90 s) | `AUTH_LOCK_TTL_MS` |

The sign-in phase runs under its own `AbortController`. On expiry it closes the sign-in context
and reports `Test not started: … did not finish within 60 s` (fixes B8). `TEST_TIMEOUT_MS` starts
when the test context is created, so slow sign-ins don't eat into the test's own budget. The
settings come from env, read in one place in `index.ts`, following the existing `intEnv` pattern.

---

## 8. Security

- **Where secrets may exist:** in Postgres as Fernet ciphertext (`credentials_enc`,
  `totp_enc`, `storage_state_enc`); in backend memory during save, verify and recording
  substitution; in worker memory during sign-in. Nowhere else.
- **Where they must never appear:** job payloads, Redis, logs, error messages, step labels,
  screenshots, traces, API responses, exports, `login_flow`, `api_login`, or files on disk (except
  the codegen temp file in 2c, which is `0600`, uniquely named, and deleted in `finally`).
- **Redactor** (`worker/src/redact.ts`, mirrored in the backend recording path): built per sign-in
  from the decrypted values (username, password, current/previous/next TOTP codes, token values
  read in API login). Applied to every string leaving the sign-in module: log lines, `AuthProfileError`
  messages, captured page error text and step labels. It replaces each value with `•••`.
  `safeError` (`authProfiles.ts:400-403`) wraps it. Logs keep the existing `event=… job=… profile=…
  outcome=…` shape and never include the decrypted payload.
- **Keys:** a single `TESTFLOW_SECRET_KEY` is shared by backend and worker (already required:
  `fernet.ts:13-28`, `AUTH_PROFILE_REKEY.md`). Distribution: from the compose `.env` locally, from
  the deployment's secret manager elsewhere, never committed. Rotation stays an explicit rekey
  operation. Moving to a `MultiFernet` key list for zero-downtime rotation is Q8.
- **Internal API:** today the worker reads `auth_profiles` straight from Supabase with the service
  role. That is acceptable for now, since it is the same trust boundary as the runner. When the
  ADR-008 internal run-definition API lands, it must **not** carry decrypted secrets over HTTP. The
  runner keeps decrypting with its own key copy, or fetches ciphertext.
- **Who can view and edit** (future RBAC; today any project member can do everything):
  - viewer: sees name, method, status, health.
  - editor: changes method, success check, selectors and flow, and runs Test sign-in.
  - admin/owner: sets or replaces credentials and TOTP.
  - No role can read secrets back. The "Replace" UX makes that explicit.
- **Audit:** `credentials_updated_at/by`, `totp_updated_at/by`, `updated_at/by` and
  `last_sign_in_*` on the row. `updated_by` comes from the Supabase JWT `sub` the API already
  validates. A full `auth_profile_events` history table is Q9.
- **Recording on the host:** codegen runs on the tester's own machine (ADR-003). The temp output
  file lives in the bind-mounted repo for the length of the recording. The tester typed the
  password there anyway, but the file must be inside an ignored directory
  (`automation/auth-profiles/**` is already ignored). Verify that in PR 4.

---

## 9. Rollout (PR-sized)

| # | PR | Size | Acceptance criteria |
|---|---|---|---|
| 1 | **Multi-step form login + success check + error detection + sign-in timeout** (worker), migration columns `sign_in_method`, `success_check`, `form_selectors`, `failure_check`, `session_saved_at`, `last_sign_in_*`, `updated_at` | M | A two-step login fixture (email → Continue → password) signs in headless. A single-step fixture still works. With a wrong password, the run reports `Test not started: Sign-in for "X" was rejected by the application: "Invalid password".` and the log has no password. An identifier-only page no longer counts as a valid session (B3). A hung login page ends in `Test not started … within 60 s` (B8). Login URL follows the environment (B9). Unit tests use local HTML fixtures. |
| 2 | **Per-profile lock, validation cache, failure pause** | S | 5 parallel jobs on one expired profile produce exactly 1 login (asserted with a counting fixture server). The other 4 reuse it. 3 rejected sign-ins pause the profile, and the next job makes 0 requests to the app and reports `paused`. `PUT credentials` clears the pause. |
| 3 | **Test sign-in via queue + method UI + status badge** | M | `POST …/sign-in-test` returns 202 and a job id, and FastAPI launches no browser. The drawer shows step results. A failed step's screenshot has the password field masked (checked by pixel test on a fixture). The segmented control persists `signInMethod`. Badge states match 4.3. Storybook stories for the method control, `SignInResult` and the status badge (Default/Loading/Error/Empty). |
| 4 | **Recorded flow with placeholders** (host `/record-login-flow`, codegen → steps parser, substitution + residual guard, worker step executor, masking) | L | Recording a two-step login against a fixture saves `login_flow` containing `{{username}}`/`{{password}}` and no literal secret (grep test). The temp file is gone after success *and* after an aborted recording. A password containing `");alert(1)//` replays correctly (proves no source splicing). A recording where a different password was typed is rejected with the exact 400 message. |
| 5 | **TOTP** | S | `PUT /totp` rejects a wrong `verifyCode` and accepts the right one. RFC 6238 test vectors pass. A fixture with a TOTP step signs in via both `form` and `recorded_flow`. The code never appears in logs, responses or the step label. The rekey script covers `totp_enc`. |
| 6 | **API login** | M | Cookie capture and localStorage capture both sign in against fixtures, sharing code with the refresh path. A literal password in `apiLogin.body` is rejected on save. |
| 7 | **Clean-up** | S | `automation/framework/auth_session.py` either delegates to nothing new (frozen, with a header comment) or is removed with the legacy runner. `needsRenewal` semantics updated. Docs updated. |

Order rationale: 1 and 2 fix silent failures and the lockout risk for every existing profile with
credentials. 3 makes the heuristic trustworthy because testers can see it work. 4 is the big
coverage jump. 5 and 6 are cheap add-ons on top of the 4 machinery.

---

## 10. Alternatives considered

- **Record the flow as codegen source and replay through `playback.ts` + `new Function`.** This
  reuses the most code today, but placeholder substitution into source is an injection risk and it
  deepens the ADR-002 divergence. Rejected. We reuse the recorder and the codegen grammar, not the
  eval.
- **Recording-only (no heuristic).** Simple and deterministic, but it forces exactly the step the
  tester asked to skip, for the majority of apps where a heuristic would work. Rejected as the default.
- **Storing the login flow as a regular Test Case** ("login" case run as a dependency). This breaks
  ADR-007 (cases must not depend on other cases) and mixes identity with scenarios (ADR-014's
  boundary). Rejected.
- **Running sign-in in FastAPI** (for Test sign-in latency). This violates ADR-008. Rejected.
- **Headless-evasion tooling for IdP bot checks.** Brittle and possibly against IdP terms. Rejected (2f).

## 11. Consequences

- Most profiles need no recording. The tester's question is answered by the default method.
- A recorded flow becomes the first structured, executable step list in the product, which is a
  concrete foothold for ADR-002.
- More configuration surface on the profile. It is mitigated by defaults, collapsed sections, and
  Test sign-in suggesting the next method.
- New state in Redis (locks) and Postgres (health counters) must be covered by the existing reaper
  and crash-recovery story.

## 12. Open questions

1. **ADR number:** confirm 018 (013 is taken by two-tier execution).
2. **Codegen output format:** parse codegen's Python output (what the recorder emits today), or
   switch the login recorder to codegen's `jsonl` target if the pinned Playwright version exposes
   it (needs a spike)? And should test cases adopt the same structured steps and executor, retiring
   `new Function`, on the same timeline?
3. **Should the username be returned** by the API (it is today)? It is PII but not a secret, and it
   helps testers tell profiles apart.
4. **ADR-008 internal API vs direct Supabase reads** by the worker: accept direct reads with the
   service role as the long-term pattern for auth profiles, or move them behind the internal API?
5. **Profiles and environments:** is a profile per project (login URL retargeted per environment,
   as proposed) or per environment (Staging admin ≠ Production admin; different credentials)? This
   decides whether `environment_id` belongs on `auth_profiles`.
6. **Pause policy:** 3 failures and 15 min / 1 h / 4 h backoff. Does this match the lockout
   thresholds of the apps the team tests?
7. **Captcha and MFA policy for test accounts:** can the team get captcha disabled and TOTP-only MFA
   for test accounts on the target apps? This decides how often `session_only` is needed.
8. **Key rotation:** adopt `MultiFernet` (`TESTFLOW_SECRET_KEYS`, newest first) so rotation needs no
   downtime, or keep the explicit rekey script only?
9. **Audit depth:** columns only (proposed), or an `auth_profile_events` table recording who changed
   what and every sign-in outcome?
10. **Recording without the host recorder:** the fallback that launches codegen inside the API
    process (`automation_service.py:56-70, 205-219`) contradicts ADR-008. Should record-flow require
    `RECORDING_DELEGATE_URL` and refuse otherwise?
11. **Run report:** should a sign-in that happened during a test run appear as an "Arrange · Sign in"
    step in the TestRun's step results (proposed: one synthetic step with outcome and duration, no
    screenshots unless it failed)?
