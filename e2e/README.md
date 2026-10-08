# Attest UI end-to-end tests (Playwright Test Agents)

Tests for the Attest web app itself, written with Playwright's agentic workflow
(<https://playwright.dev/docs/test-agents>): a **planner** explores the app and writes a plan,
a **generator** turns the plan into tests (verifying locators live), and a **healer** fixes failing tests.

This folder is separate from the product. It does not change how Attest runs customer tests.

## Setup

```bash
cd e2e
npm install
npx playwright install chromium
```

The app must be running (default `http://127.0.0.1:3001`, override with `ATTEST_URL`).
Sign-in uses your own account from environment variables; never commit them:

```bash
export ATTEST_EMAIL="you@example.com"
export ATTEST_PASSWORD="..."
```

## Using the agents (Claude Code)

Open Claude Code **in this folder** (`cd e2e && claude`). It picks up `.claude/agents/*` and the
`playwright-test` MCP server from `.mcp.json`. Then ask, for example:

1. Planner: "Use the playwright-test-planner agent to create a test plan for creating a project and an environment in Attest. Use tests/seed.spec.ts as the seed." The plan is saved to `specs/`.
2. Generator: "Use the playwright-test-generator agent to generate tests for specs/<plan>.md."
3. Healer: "Use the playwright-test-healer agent to fix the failing tests."

Run the tests: `npx playwright test`, then open the report with `npx playwright show-report`.

## Notes

- `tests/seed.spec.ts` signs in and leaves the browser on the dashboard, so every agent starts signed in.
- Generated tests create real data in whatever backend the app points at. Use a test project, and clean up after.
- Agent definitions are regenerated with `npx playwright init-agents --loop=claude` after a Playwright upgrade.
