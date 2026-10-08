import { test, expect } from "@playwright/test";

// Seed for Playwright Test Agents: leaves the browser signed in to Attest on the dashboard.
// Credentials come from the environment only (never commit them):
//   ATTEST_EMAIL=you@example.com ATTEST_PASSWORD=... npx playwright test
test.describe("Attest", () => {
  test("seed", async ({ page }) => {
    const email = process.env.ATTEST_EMAIL;
    const password = process.env.ATTEST_PASSWORD;
    test.skip(!email || !password, "Set ATTEST_EMAIL and ATTEST_PASSWORD to sign in.");

    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  });
});
