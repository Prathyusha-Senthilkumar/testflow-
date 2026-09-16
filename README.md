# TestFlow - Unified Test Automation Platform

TestFlow is a QA-focused web application for managing testing projects, test suites, test cases, Playwright automation and execution results.

## Current milestone

Working application areas:

- Supabase Auth login with demo fallback
- Dashboard
- Projects
- Create/Edit Project
- Project Overview
- Suite summaries
- Existing Python Playwright + pytest framework preserved

## Architecture

```text
Next.js frontend
    ↓
FastAPI routers
    ↓
    ↓
    ↓
Repository and Supabase client
    ↓
Supabase
```

Playwright execution is kept separately under `automation/`.

## Project structure

```text
college_website_testing_framework/
├── frontend/
│   └── src/
│       ├── app/              # Next.js App Router routes
│       ├── components/       # Reusable TestFlow UI
│       ├── views/            # Page-level view components
│       └── lib/              # API and Supabase clients
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── schemas/
│   │   │   ├── project.py
│   │   │   ├── dashboard.py
│   │   │   └── crawler.py
│   │   ├── services/
│   │   │   ├── projects_service.py
│   │   │   ├── dashboard_service.py
│   │   │   ├── crawler_service.py
│   │   │   └── test_generator_service.py
│   │   ├── repositories/
│   │   │   └── project_repository.py
│   │   └── routers/
│   │       ├── projects.py
│   │       ├── dashboard.py
│   │       └── crawler.py
│   ├── run.py
│   ├── requirements.txt
│   └── test_api.py
├── automation/
│   ├── config/
│   ├── framework/
│   ├── runner/
│   └── scripts/
├── supabase/
│   ├── schema.sql
│   └── migrations/
├── run_tests.py
├── start_framework.bat
└── requirements.txt
```

See `RESTRUCTURE_NOTES.md` for the exact old-to-new file mapping and migration notes.

## Start the frontend

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

The frontend runs at `http://localhost:3000`.

## Start the backend

```bash
cd backend
python -m pip install -r requirements.txt
copy .env.example .env
python run.py
```

The FastAPI backend runs at `http://localhost:8000`.

Without Supabase credentials, the backend runs with demo data so Dashboard and Projects can still be reviewed.

## Configure Supabase

For a fresh Supabase project, run `supabase/schema.sql` in the SQL editor.

For an existing project created with the old schema, use `supabase/migrations/001_suite_case_many_to_many.sql` instead.

Then configure:

Frontend `.env`:

```text
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Backend `.env`:

```text
PORT=8000
FRONTEND_URL=http://localhost:3000
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Never expose the service-role key in the frontend.

## Python Playwright framework

The old command is intentionally preserved:

```bash
python run_tests.py
```

Developer commands:

```bash
python run_tests.py list
python run_tests.py validate --config tests/<feature>/data.json
python run_tests.py run --config tests/<feature>/data.json
python run_tests.py record --title "Example" --output tests/example/test_example.py
```

The framework configuration now lives at `automation/config/framework.json`.
