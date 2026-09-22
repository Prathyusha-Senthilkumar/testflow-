# ADR-011 — Electron desktop testing as a second run target

Status: Proposed
Date: 2026-09-18
Depends on: ADR-010 (capability registry), ADR-008 (runner boundary)
Scope note: Electron only. Native Windows/macOS apps are explicitly not covered, see Alternatives.

## Context

The MVP tests web applications reached through a base URL. The team wants to test desktop
applications as well. Electron apps run Chromium under the hood and Playwright ships a
first-party Electron API, so the question is whether desktop support forks the platform or
reuses it.

It largely reuses it. An Electron window resolves to a normal Playwright `Page`, which means
locators, the whole assertion vocabulary, tracing, screenshots, console capture and network
capture all carry over unchanged. What differs is how execution *starts* and what "environment"
means when there is no URL.

## Decision

Introduce a **run target** as a discriminated union on the run definition. Everything downstream
of target resolution stays shared.

```
target:
  kind: "web"       -> { base_url, browser: chromium }
  kind: "electron"  -> { app_ref, args[], env{} }
```

- The runner resolves `kind: "electron"` through Playwright's Electron launcher, takes the first
  window as the `Page`, and hands that Page to the existing step executor. No second engine.
- **Environment** for an Electron target means a build, not a URL. An Environment row gains an
  optional `app_ref` pointing at a versioned application artifact rather than a base URL.
  The same Test Case can then run against a staging build and a release build.
- **Application artifacts are inputs, not test assets.** The build is fetched into the runner by
  reference (artifact store or registry URL, pinned by digest) at run start. Builds are never
  committed to this repo and never embedded in the queue payload, per ADR-005.
- A new `desktop` capability under ADR-010 registers the app-level steps and assertions that have
  no web equivalent: window count, window focus, menu state, and main-process evaluation via
  `electronApp.evaluate()`. Ordinary DOM steps stay in `functional` and are untouched.
- **Responsive maps to window resize, not viewport emulation.** Device-pixel and mobile emulation
  presets are meaningless for a desktop shell. The responsive capability must reject mobile and
  tablet presets when the target is Electron rather than silently emulating them.
- The Electron runner is a **separate image** from the web runner, because it carries the app
  under test plus a display server. It registers for `electron` jobs from the same queue.
  The TestRun contract does not change, so the reporting UI needs no target-specific path.

## Alternatives considered

- **Native OS automation (WinAppDriver, Appium, XCUITest).** This is the other thing "desktop
  testing" can mean. It is a genuinely separate engine with its own locator and step vocabulary,
  and it cannot run in a Linux container, so it needs Windows and macOS runner hosts. It would
  reuse the TestRun contract and the results UI and nothing else. Out of scope for now; if it is
  ever pulled in it needs its own ADR and its own runner fleet, not an extension of this one.
- **Drive Electron over the remote debugging port as if it were a website.** Works for a demo,
  loses main-process access and app lifecycle control, and breaks the moment the app opens a
  second window.
- **Treat Electron as a browser choice rather than a target.** Conflates "which browser" with
  "what am I launching", and leaves no place to put the app reference.

## Consequences

- **The recorder does not cover this.** Playwright codegen has no Electron mode, so ADR-003's
  primary authoring path is unavailable for desktop cases at launch. Desktop tests are authored
  in the manual step builder until a recorder path exists. This is the largest gap in this ADR
  and should be stated plainly to users rather than discovered by them.
- **Auth profiles partially carry over.** `storageState` covers renderer cookies and localStorage.
  Desktop apps that keep credentials in the OS keychain or a file on disk are not covered by
  ADR-004's refresh flow, and need either a seeded profile directory or an app-specific login
  flow. Treat as an open question, not a solved one.
- A Linux container tests the **Linux build** of the app. Verifying Windows or macOS builds needs
  runner hosts on those platforms, which is the same cost the native-automation alternative
  carries. Do not promise cross-platform desktop coverage on the strength of this ADR.
- Runner images grow substantially and need a display server for headed runs. Image build and
  pull time becomes a real factor in run latency.
- Artifact handling gains a supply-chain surface: the platform now pulls executable builds into
  runners. Pin by digest, restrict the artifact sources per project, and never accept an
  arbitrary path from an API caller.
