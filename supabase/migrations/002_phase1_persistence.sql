-- TestFlow Phase 1 persistence (additive, safe for existing data).
-- Adds environments + test_case_versions, extends test_cases/test_suites/test_runs.
-- Existing rows (SRM project, suites, cases, runs) are preserved via IF NOT EXISTS + defaults.

-- 1. Environments (one project -> many environments)
create table if not exists public.environments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  base_url text not null,
  created_at timestamptz default now()
);

-- 2. Test suite descriptions (UI already uses descriptions)
alter table public.test_suites add column if not exists description text;

-- 3. Test case configuration fields required by the current UI
alter table public.test_cases add column if not exists category text;
alter table public.test_cases add column if not exists scenario text;
alter table public.test_cases add column if not exists start_path text default '/';
alter table public.test_cases add column if not exists environment_id uuid;
alter table public.test_cases add column if not exists expected_result text;
alter table public.test_cases add column if not exists is_draft boolean default true;
alter table public.test_cases add column if not exists published_version integer default 0;

-- FK for environment_id -> environments (nullable; null means project default env)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'test_cases_environment_id_fkey'
      and table_name = 'test_cases'
  ) then
    alter table public.test_cases
      add constraint test_cases_environment_id_fkey
      foreign key (environment_id) references public.environments(id) on delete set null;
  end if;
end $$;

-- 4. Version history / publish snapshots
create table if not exists public.test_case_versions (
  id uuid primary key default gen_random_uuid(),
  test_case_id uuid not null references public.test_cases(id) on delete cascade,
  version_number integer not null,
  label text not null,
  published_at timestamptz default now(),
  snapshot jsonb not null default '{}'::jsonb
);

-- 5. Test runs: support async lifecycle states + queue metadata
alter table public.test_runs add column if not exists job_id text;
alter table public.test_runs add column if not exists config_path text;

-- Extend status constraint to include Queued/Running (keeps existing values valid)
alter table public.test_runs drop constraint if exists test_runs_status_check;
alter table public.test_runs
  add constraint test_runs_status_check
  check (status in ('Queued','Running','Passed','Failed','Not Run'));
