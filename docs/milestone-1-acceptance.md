# Milestone 1 — one test, created and executed

Owner: the lead. Status: proposed, 21 Sep 2026.

## The goal

One test case, created in the UI, executed by the separate runner through the queue, with its
real result displayed. That is the entire milestone.

It is deliberately narrow because nothing in the product currently works end to end. Every
branch has UI, and every branch has an execution path that does not execute the requested test.
Until one path works all the way through, more features add surface without adding capability.

## Not in this milestone

User stories, responsive viewports, suite runs, cross-browser, recording, CI/CD, Docker Compose,
auth profile refresh, and every capability in `capability-roadmap.md`. Do not start them. If a
task does not move the demo script below, it is out of scope.

Recording is excluded despite being ADR-003's primary authoring path, because it currently
launches Chromium inside FastAPI and must be rebuilt behind the runner boundary. Manual step
entry is sufficient for this milestone.

## Blocking defects — fix before anything else

These three make the milestone impossible and are already present on `release/dev`.

1. **The UI never calls the API.** `frontend/src/lib/api.ts` awaits `supabase.auth.getSession()`
   before every request. In demo mode that call never settles, so no fetch fires, no error
   appears, and every page sits on a loading placeholder forever. Fix: do not block a request on
   a session lookup when Supabase is unconfigured, and give the lookup a timeout.

2. **Chromium runs inside FastAPI.** `backend/app/services/crawler_service.py` and
   `backend/app/services/automation_service.py` both launch it, the latter synchronously inside a
   request handler, which blocks the event loop. ADR-008 forbids this. Fix: move both behind the
   runner boundary, or disable the endpoints until they are.

3. **Duplicate page components.** 16 components in `frontend/src/views/` and 7 more under
   `frontend/src/views/<area>/` with overlapping names. Routes import one, the other drifts. Fix:
   delete the unused copy of every pair and keep the one the route imports.

## The demo script

The lead performs these steps. A developer watching is not a demo. If any step needs a manual
database edit, a restarted service, or a "it works if you also run this", the milestone is not
met.

1. Start the stack from a clean checkout.
2. Create a project and an environment with a base URL.
3. Create a test suite and one test case inside it.
4. Add steps to the test case: navigate, then one interaction.
5. Add one assertion that is true of the target page.
6. Run the test case. Observe the status move from queued to running.
7. See the run finish with a real pass and a per-step breakdown.
8. Change the assertion to something false. Run again.
9. See the run fail, with a readable failure reason, a screenshot and a trace.
10. Open run history and see both runs with correct statuses.
11. Create a **second, different** test case and run it. Confirm the result reflects that test
    and not the first one.

Step 11 exists because the current runner discards the requested test case identifier and
executes a fixed file. It is the single most important step in this list.

## Required automated test

One integration test, named and owned, that:

- creates two test cases with different steps and different expected outcomes,
- runs both through the real queue and runner,
- asserts the two results differ and each matches its own definition.

This test makes the hardcoded-path defect impossible to reintroduce. No merge into the trunk
without it passing.

## Definition of done

- [ ] The demo script runs start to finish, performed by the lead, no manual intervention.
- [ ] The required integration test exists and passes in CI.
- [ ] Run records persist in the database. Not JSON files, not process memory.
- [ ] The API does not launch a browser anywhere.
- [ ] The runner resolves the requested test case's stored definition.
- [ ] A failed run produces a screenshot and a trace.
- [ ] `docs/adr/` is updated if any decision here changed.

## Owners

| Area | Owner |
|---|---|
| Run contract, the backend-to-runner seam | *one person, named* |
| Runner and queue | |
| Frontend wiring and the api.ts fix | |
| Trunk and merge order | the lead |

The run contract needs a single named owner. It is the seam where all three branches failed, and
it failed because nobody owned it.
