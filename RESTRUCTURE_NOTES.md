# Restructure Notes

## What changed

The backend now follows the agreed layered structure:

```text
Controller -> Service -> ServiceImpl -> Repository -> Supabase
```

The Python Playwright framework was moved under `automation/` while keeping the root `run_tests.py` entry point, so existing commands still work.

## Old -> new mapping

| Old location | New location |
|---|---|
| `backend/src/dashboard/dashboard.controller.ts` | `backend/src/controller/dashboard.controller.ts` |
| `backend/src/projects/projects.controller.ts` | `backend/src/controller/projects.controller.ts` |
| `backend/src/projects/projects.service.ts` | split into `service/projects.service.ts`, `serviceimpl/projects.service.impl.ts`, and `repo/project.repository.ts` |
| `backend/src/common/supabase.service.ts` | `backend/src/config/supabase.config.ts` |
| `framework/*` | `automation/framework/*` |
| `config/framework.json` | `automation/config/framework.json` |
| root `run_tests.py` | retained as a compatibility entry point |

## Added backend folders

- `config/` - Supabase/application configuration
- `models/` - application entities
- `schema/` - database/view row shapes
- `dto/` - API request data shapes
- `controller/` - HTTP endpoints
- `service/` - service contracts
- `serviceimpl/` - business logic implementations
- `repo/` - Supabase/database access

## Dashboard and Projects milestone

The following are now wired to the NestJS API:

- Dashboard summary cards
- Recent project list
- Dynamic projects page
- Create Project
- Project Overview
- Edit Project
- Suite summary display
- Empty/loading/error states

When Supabase is not configured, the backend uses an in-memory demo project so the UI can still be reviewed. Projects created in demo mode exist until the backend process restarts.

## Suite classification preparation

The data model now treats a test case as belonging to a project, while suites group test cases using the `test_suite_cases` mapping table. This supports:

- one project -> many test cases
- one project -> many suites
- one test suite -> many test cases
- one test case -> multiple suites
- future suggested suite classification

`test_cases.suggested_suite_name` and `test_suites.source` are included as minimal preparation for the suggestion/review flow. The actual AI generation/classification service is intentionally not faked in this milestone because the uploaded codebase does not yet contain a test-generation/AI provider.

## Supabase

For a new database, run:

```text
supabase/schema.sql
```

If your Supabase project already uses the older schema, run:

```text
supabase/migrations/001_suite_case_many_to_many.sql
```

The migration preserves the legacy `suite_id` column instead of deleting it immediately.

## Local start

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend:

```bash
cd backend
npm install
npm run start:dev
```

Python automation:

```bash
python -m pip install -r requirements.txt
python -m playwright install chromium
python run_tests.py
```

## Validation performed

- NestJS backend TypeScript build: passed
- React/TypeScript type-check: passed
- Python framework compile check: passed
- `python run_tests.py list`: passed

The full Vite production bundle was not executed in the Linux working environment because the uploaded ZIP contained Windows `node_modules` with a platform-specific Rolldown native binding. The returned ZIP omits `node_modules`; running `npm install` on your Windows machine will install the correct native dependency before `npm run dev`/`npm run build`.
