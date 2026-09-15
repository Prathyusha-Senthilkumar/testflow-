# TestFlow Dashboard + Projects setup

This milestone completes the Dashboard and Project management foundation while restructuring the backend into the agreed layered architecture.

## 1. Frontend

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

## 2. Backend

```bash
cd backend
npm install
copy .env.example .env
npm run start:dev
```

## 3. Supabase

For a fresh Supabase project, run `supabase/schema.sql`.

If your existing Supabase database already has the previous schema, run `supabase/migrations/001_suite_case_many_to_many.sql` instead.

Then create a test user in Supabase Auth and populate the frontend/backend `.env` values.

## Working routes

- `/login`
- `/dashboard`
- `/projects`
- `/projects/:id`

## Working API routes

- `GET /api/dashboard`
- `GET /api/projects`
- `GET /api/projects/:id`
- `POST /api/projects`
- `PATCH /api/projects/:id`

## Intentional next-phase items

The suite detail page, test-case generation UI, AI suite suggestion review, and Playwright execution endpoint are not mocked as complete features. The schema and folder structure are prepared for them without adding fake production logic.
