# ADR-010 — Capabilities extend a registry, not the engine

Status: Proposed
Date: 2026-09-18
Supports: ADR-002 (structured definition), ADR-008 (runner boundary)

## Context

MVP v4 ships Functional and Responsive only, but section 9 of the design requires that
Network, Storage/Cookies, Accessibility and later capabilities arrive "without introducing a
separate execution engine". Today there is no mechanism for that. A new capability would mean
editing the runner's step handling, the Pydantic schemas, the validation layer and the report
UI in lockstep, which is exactly the coupling the design warns against.

Without a seam, every deferred capability in `capability-roadmap.md` becomes an engine fork.

## Decision

A **capability** is a named bundle that registers four things and nothing else:

1. **Step types** — a schema plus an executor. `network.mockRoute`, `storage.setCookie`.
2. **Assertion types** — a schema plus an evaluator. `a11y.noViolations`, `storage.cookieEquals`.
3. **Run configuration** — fields merged into the run definition. `responsive.viewport`.
4. **Artifact collectors** — hooks that run on completion or failure. An axe report, a HAR file.

Rules that make this work:

- A Test Case declares `capabilities: ["functional", "responsive"]`. The **validation layer**
  rejects a definition that uses a step or assertion whose capability is not declared and
  enabled for that project. Validation happens in the backend before enqueueing, never in the runner.
- Step and assertion types are **namespaced** by capability. Core browser actions stay in
  `functional`. Nothing else may claim an unprefixed name.
- The registry is **shared contract, duplicated implementation**. The backend holds the schemas
  for validation and UI generation; the runner holds the executors. They are versioned together
  through a single schema artifact, so a runner that does not know a step type fails the run
  with `unsupported_capability` rather than silently skipping it.
- A capability may not reach into another capability's state or reorder the step pipeline.
  Cross-capability behaviour is a core engine change and needs its own ADR.
- Capabilities are **enabled per project**, so pulling one into a milestone does not force it
  on every tester.

The run definition therefore looks like this, and only the `capabilities` block grows:

```
TestRun
  target        (see ADR-011)
  environment   base_url, overrides
  auth_profile
  capabilities  { responsive: {viewport}, network: {...}, a11y: {...} }
  steps[]       { type, capability, args, locator }
  assertions[]  { type, capability, args }
```

## Alternatives considered

- **Add step types directly to the core executor.** Simplest for the first capability and
  unworkable by the third. The executor becomes a switch statement owned by everyone.
- **A plugin system with runtime-loaded code.** Real isolation, but it needs sandboxing,
  versioning and a distribution story the team does not need for in-house capabilities.
- **A separate runner service per capability.** Multiplies the ADR-008 boundary cost and
  breaks the single-TestRun contract for a case that uses two capabilities at once.

## Consequences

- Network, Storage/Cookies and Accessibility become additive work. Each is a registration plus
  a UI affordance, not an engine change. This is the main payoff.
- The step editor UI can be **generated from the registry schemas**, so a new capability gets a
  usable form without bespoke React work.
- A schema-version mismatch between backend and runner is now a real failure mode. It needs an
  explicit version field on the run definition and a startup compatibility check in the runner.
- Registry design must be done **before** the first extra capability lands, or the seam will be
  retrofitted around whichever capability happened to be first.
- Responsive should be migrated to this model as the reference implementation, since it is the
  one non-functional capability already in scope.
