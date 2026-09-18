import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test('sample page loads with the selected auth profile when provided', async ({ page, context }) => {
  const storageStatePath = process.env.STORAGE_STATE;
  let targetUrl = process.env.TESTFLOW_BASE_URL || 'about:blank';

  if (storageStatePath) {
    const storageState = JSON.parse(fs.readFileSync(storageStatePath, 'utf8'));
    targetUrl = process.env.TESTFLOW_BASE_URL || storageState.origins?.[0]?.origin || targetUrl;
  }

  await page.goto(targetUrl);

  if (storageStatePath) {
    const cookies = await context.cookies();
    const localStorageKeys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(cookies.length + localStorageKeys.length).toBeGreaterThan(0);
  }
});
