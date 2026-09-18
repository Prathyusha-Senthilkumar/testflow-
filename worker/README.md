# TestFlow Worker

This worker watches the execution queue and consumes queued jobs.

## Commands

```powershell
cd worker
npm install
node src/worker.js
```

The worker updates the execution status as:

- QUEUED
- RUNNING
- PASSED
- FAILED

It runs the Node Playwright test and updates the execution result record.
