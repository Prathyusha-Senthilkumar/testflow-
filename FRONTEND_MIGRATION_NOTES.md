# Frontend Migration Notes

This ZIP contains the frontend redesign based on the supplied Figma screens. The existing NestJS backend and Python automation folders are intentionally left unchanged for the later backend migration to FastAPI.

## Updated frontend routes
- `/login`
- `/dashboard`
- `/projects`
- `/projects/:id`
- `/projects/:id/test-cases`
- `/projects/:id/test-cases/:caseId`
- `/projects/:id/suites`
- `/projects/:id/suites/review`
- `/projects/:id/suites/:suiteId`
- `/projects/:id/runs/:runId/live`
- `/projects/:id/results/:runId`
- `/runs`
- `/reports`
- `/settings`

## Design notes
- New sidebar/top-bar shell styled to match the Figma exports.
- Added test-case list with bulk selection, filters, suite membership and actions.
- Added automation-first test-case detail. It shows the Playwright script instead of storing/displaying manual test steps.
- Added test suite list, suite detail, suggestion review and create-suite modal.
- Added live execution, pass/fail result, execution history and analytics screens.
- Result/live-execution screens can show runtime execution steps because these are execution output, not manually maintained test definitions.

## Data/API status
The new screens use `src/lib/demoData.ts` for the Figma/demo content where the current NestJS API does not yet expose the required endpoints. Existing backend code was not migrated or removed.

When FastAPI is implemented later, replace the demo-data reads with API calls while keeping these UI components/routes.

## Run locally
```bash
cd frontend
npm install
npm run dev
```

For a production check after dependencies install:
```bash
npm run build
```
