# Architecture Decision Records

ADR-001 to ADR-009 live in `QA_E2E_Platform_MVP_Design_ADR_v4` (15 Sep 2026), section 12.
They are summarised in `CLAUDE.md`. ADR-010 onward are recorded here as markdown so they
version with the code.

| ADR | Title | Status |
|-----|-------|--------|
| 001 | Playwright + Chromium as initial execution engine | Accepted (v4 doc) |
| 002 | Structured test definition is the source of truth | Accepted (v4 doc) |
| 003 | Browser-assisted recording is the primary authoring path | Accepted (v4 doc) |
| 004 | Hybrid authentication profiles | Accepted (v4 doc) |
| 005 | Queue-controlled run parallelism | Accepted (v4 doc) |
| 006 | CI/CD execution is an extension of TestRun | Accepted, design only (v4 doc) |
| 007 | Story dependencies do not create test dependencies | Accepted (v4 doc) |
| 008 | Backend orchestration and isolated runner service | Accepted (v4 doc) |
| 009 | Local-first containerized development | Accepted (v4 doc) |
| [010](ADR-010-capability-extension-model.md) | Capabilities extend a registry, not the engine | Proposed |
| [011](ADR-011-electron-desktop-testing.md) | Electron desktop testing as a second run target | Proposed |
| [012](ADR-012-cicd-and-run-api.md) | CI/CD through a public Run API and CLI | Proposed, supersedes ADR-006 when accepted |
| [013](ADR-013-two-tier-execution.md) | Warm pool for interactive runs, containers for CI | Proposed |

See `../capability-roadmap.md` for every capability deferred out of the MVP and what each costs.

## Template

```
# ADR-NNN — Title
Status: Proposed | Accepted | Superseded by ADR-NNN
Date / Owner
## Context
## Decision
## Alternatives considered
## Consequences
```
