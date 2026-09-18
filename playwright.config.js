const fs = require('node:fs');

const storageStatePath = process.env.TESTFLOW_STORAGE_STATE;
const use = {
  headless: true,
  trace: 'retain-on-failure',
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
};

if (storageStatePath && fs.existsSync(storageStatePath)) {
  use.storageState = storageStatePath;
}

module.exports = {
  testDir: './tests/playwright-js',
  timeout: 30000,
  expect: {
    timeout: 15000,
  },
  reporter: [['list']],
  use,
};
