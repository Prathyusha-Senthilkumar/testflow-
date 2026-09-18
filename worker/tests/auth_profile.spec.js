import { test, expect } from '@playwright/test';

test('uses the selected Auth Profile when one is provided', async ({ page, context }) => {
  await page.goto(process.env.TESTFLOW_BASE_URL || 'about:blank');

  if (process.env.STORAGE_STATE) {
    const cookies = await context.cookies();
    const localStorageKeys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(cookies.length + localStorageKeys.length).toBeGreaterThan(0);
  }
});