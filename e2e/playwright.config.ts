import { defineConfig, devices } from "@playwright/test";

// E2E tests for the Attest UI itself (dogfooding Playwright Test Agents).
// Point ATTEST_URL at a running frontend; defaults to the local dev server.
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.ATTEST_URL || "http://127.0.0.1:3001",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
