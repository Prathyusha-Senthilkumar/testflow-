# ADR-016 — Accessibility capability

Status: Proposed
Date: 2026-09-22
Depends on: ADR-010 (capability registry)

## Context

Accessibility checks are a natural fit for a platform that already drives a real browser to a
real application state. The cost is low: `@axe-core/playwright` injects the axe engine and returns
structured violations.

The engineering is small. The product design is not. A raw axe result dump is unusable, and an
automated scan run against an existing application returns a wall of pre-existing violations that
nobody asked this test to care about. Most accessibility features fail on those two problems
rather than on the scan itself.

## Decision

Register an `a11y` capability contributing one assertion, one artifact and per-project
configuration.

**Assertion**: `a11y.noViolations`, with arguments

- `scope`: a selector to confine the scan, defaulting to the whole page
- `standard`: the rule tag set, for example `wcag2a`, `wcag2aa`, `wcag21aa`
- `minImpact`: `critical` | `serious` | `moderate` | `minor`, defaulting to `serious`
- `ignoreRules`: rule ids waived for this assertion, each requiring a reason string

**Artifact**: the full axe result as JSON on every run where the assertion executes, pass or
fail. Passing scans are what make a baseline reviewable and a trend visible.

**Project configuration**: a rule baseline. A project may waive a rule globally, with a reason and
an owner, so that a known pre-existing violation does not fail every unrelated test. Waivers are
visible in project settings, not buried in individual test definitions.

Rules:

- **Scan the state, not the page.** The value of scanning here rather than in a static crawler is
  that the test has already opened the modal, expanded the accordion and submitted the form. Guide
  testers to assert after reaching an interesting state.
- **Failure output is grouped by rule**, then by element, with the selector, the impact, the
  failure summary and axe's help URL. Never render the raw JSON as the primary view.
- **The report links each violation to the element** using the screenshot already captured, so a
  tester can see what failed without rerunning.

## What this does not claim

Automated scanning catches a subset of accessibility defects. It cannot judge whether alt text is
meaningful, whether focus order makes sense, or whether an interaction works with a screen reader.
The product must not present a passing scan as "this page is accessible". The assertion name and
the report wording should both say "no automated violations found", and the feature description
should state plainly that manual and assistive-technology testing remain necessary.

Overstating this is the most likely way for the capability to do harm, by giving a team false
confidence that a compliance obligation has been met.

## Alternatives considered

- **A separate accessibility scanner product surface, outside test cases.** Gives a nice
  whole-site report and loses the authenticated, interacted-with application states that make
  in-test scanning worthwhile. A crawler-based scan is a reasonable later addition, not a
  replacement.
- **Fail on any violation at any impact.** Defensible in principle and unusable against an
  existing codebase, which is why `minImpact` defaults to `serious` and baselines exist.
- **Store only failing scans.** Halves storage and removes the ability to show that a page got
  better or worse over time.

## Consequences

- The violations report is real frontend work, larger than the backend work for this capability.
  Budget accordingly.
- Waivers need review. A baseline with no expiry becomes permanent blindness, so waivers carry an
  owner and should surface in a project health view.
- axe version upgrades change results. Pin the version in the runner image and treat a bump as a
  deliberate change, since new rules will fail existing suites.
- This is the capability most likely to be requested by someone outside QA, typically for a
  compliance deadline. The wording limits above matter commercially, not just ethically.
