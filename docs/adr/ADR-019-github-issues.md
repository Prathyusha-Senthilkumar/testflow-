# ADR-019: GitHub issues for failed tests

Status: Accepted (12 Oct 2026)

## Context

Teams track bugs in GitHub. A failed Attest run should land there with enough evidence to act
on (steps, screenshots, failure reason, a report) without anyone copying it across by hand.

## Decision

- **One repository per project**, linked with a **fine-grained personal access token** limited to
  that repository. Required permissions: *Issues: Read and write*, *Contents: Read and write*
  (Metadata: Read is implied). GitHub itself enforces the one-repo limit. OAuth was rejected
  because its `repo` scope reaches every repository the user can access; a GitHub App is the
  likely next step if issues should come from a bot account.
- **Token storage**: Fernet-encrypted with `TESTFLOW_SECRET_KEY` (same key as Auth Profiles) in
  `project_github_connections.token_encrypted`; only the last four characters are kept in clear
  (`token_hint`). It is decrypted only to make a GitHub call, never returned, logged or included
  in an error. Without the key, connecting fails with 409 rather than storing plaintext. Users can
  replace the token, disconnect (deletes it), or disconnect and **revoke** it through GitHub's
  `POST /credentials/revoke`.
- **Issues are automatic.** The worker writes results straight to Supabase, so the backend polls
  for `Failed` runs completed after the connection was made (`GITHUB_ISSUE_POLL_SECONDS`, default
  30). Each run is claimed by inserting its `github_issues` row (unique `run_id`), so several
  backends never file it twice. If the test case already has an open Attest issue, the new failure
  is added as a **comment**; once that issue is closed, the next failure opens a new one.
  Failed attempts are stored with a readable reason and retried with backoff (3 attempts); users
  can also file or retry from the run page.
- **Evidence**: GitHub's API cannot attach files to issues, so step screenshots and a PDF report
  are committed to the `attest-reports` branch (`attest-reports/<project>/<run>/`) and embedded
  inline (`blob/...?raw=true`, which renders for anyone who can see the repo, private included).
  If the token lacks Contents permission, the issue is still filed, with a note saying what to fix.
- **PDF report** is built in pure Python (fpdf2): FastAPI never launches Chromium (ADR-008).
  `GET /api/test-runs/{id}/report.pdf` serves the same file for download.
- **Errors** from GitHub are translated into guidance (expired token, repo not selected for the
  token, missing permission, SSO authorization, org approval of fine-grained tokens, issues
  disabled, rate limit).

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/projects/{id}/github` | `{connected, owner, repo, repoUrl, tokenHint, autoCreateIssues, connectedAt}` |
| PUT | `/api/projects/{id}/github` | `{repo, token?, autoCreateIssues?}`; token required first time |
| DELETE | `/api/projects/{id}/github?revoke=true` | `{revoked, message}` |
| GET/POST | `/api/test-runs/{id}/github-issue` | `{issue: {number, url, state, createdAt, commented, error} \| null, connected}` |
| GET | `/api/test-runs/{id}/report.pdf` | PDF download |

## Setup

Apply `supabase/migrations/20261012_github_integration.sql`. `TESTFLOW_SECRET_KEY` must be set.
Optional: `GITHUB_API_URL` (GitHub Enterprise), `GITHUB_ISSUE_POLL_SECONDS`.

## Future work

Running tests when a deployment succeeds (`deployment_status` webhook → project run on the mapped
environment) builds on this connection and ADR-012; it was left out of this change.
