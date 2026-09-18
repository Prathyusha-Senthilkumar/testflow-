const { test, expect } = require('@playwright/test');

test('login flow demo passes', async ({ page }) => {
  const executionId = process.env.TESTFLOW_EXECUTION_ID || 'local';
  const authProfileId = process.env.TESTFLOW_AUTH_PROFILE_ID || '';
  const storageStateConfigured = Boolean(process.env.TESTFLOW_STORAGE_STATE);

  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example Domain|example/i);

  const artifactDir =
    process.env.TESTFLOW_ARTIFACT_DIR || './artifacts';

  const fs = require('node:fs');
  const path = require('node:path');

  fs.mkdirSync(path.join(artifactDir, 'logs'), { recursive: true });

  fs.writeFileSync(
    path.join(artifactDir, 'logs', `execution-${executionId}.log`),
    `execution_id=${executionId}\nauth_profile=${authProfileId || 'none'}\nstorage_state=${storageStateConfigured ? 'yes' : 'no'}\n`
  );
});
