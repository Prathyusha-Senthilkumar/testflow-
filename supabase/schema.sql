-- TestFlow schema for a fresh Supabase project.
-- Project -> Test Cases is the ownership relationship.
-- Test Suites group test cases through test_suite_cases so one test case may belong to multiple suites.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_url text not null,
  description text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.test_suites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  category text not null default 'regression'
    check (category in ('smoke', 'sanity', 'regression', 'full_regression')),
  source text not null default 'Manual' check (source in ('Manual','Suggested')),
  created_at timestamptz default now()
);

create table if not exists public.test_cases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  test_file text,
  automation_status text not null default 'Not Configured'
    check (automation_status in ('Manual','Automated','Not Configured')),
  suggested_suite_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.test_suite_cases (
  test_suite_id uuid not null references public.test_suites(id) on delete cascade,
  test_case_id uuid not null references public.test_cases(id) on delete cascade,
  primary key (test_suite_id, test_case_id)
);

create table if not exists public.test_runs (
  id uuid primary key default gen_random_uuid(),
  test_case_id uuid not null references public.test_cases(id) on delete cascade,
  status text not null check(status in ('Passed','Failed','Not Run')),
  run_by uuid references public.profiles(id),
  started_at timestamptz default now(),
  completed_at timestamptz,
  duration_ms integer,
  error_message text,
  screenshot_path text
);

create or replace view public.project_overview as
select
  p.id,
  p.name,
  p.base_url,
  p.description,
  p.created_at,
  count(distinct s.id)::int as suites,
  count(distinct tc.id)::int as cases,
  count(distinct tc.id) filter(where lr.status='Passed')::int as passed,
  count(distinct tc.id) filter(where lr.status='Failed')::int as failed,
  case
    when count(distinct tc.id)=0 then 0
    else round(100.0 * count(distinct tc.id) filter(where lr.status='Passed') / count(distinct tc.id))
  end::int as pass_rate,
  max(lr.completed_at) as last_run,
  max(pr.name) filter(where lr.completed_at is not null) as last_run_by
from projects p
left join test_suites s on s.project_id=p.id
left join test_cases tc on tc.project_id=p.id
left join lateral (
  select r.* from test_runs r
  where r.test_case_id=tc.id
  order by r.started_at desc
  limit 1
) lr on true
left join profiles pr on pr.id=lr.run_by
group by p.id;

create or replace view public.suite_overview as
select
  s.id,
  s.project_id,
  s.name,
  count(tc.id)::int as cases,
  count(tc.id) filter(where lr.status='Passed')::int as passed,
  count(tc.id) filter(where lr.status='Failed')::int as failed,
  count(tc.id) filter(where lr.status is null or lr.status='Not Run')::int as not_run,
  case
    when count(tc.id)=0 then 0
    else round(100.0 * count(tc.id) filter(where lr.status='Passed') / count(tc.id))
  end::int as pass_rate,
  max(lr.completed_at) as last_run,
  max(pr.name) filter(where lr.completed_at is not null) as last_run_by
from test_suites s
left join test_suite_cases stc on stc.test_suite_id=s.id
left join test_cases tc on tc.id=stc.test_case_id
left join lateral (
  select r.* from test_runs r
  where r.test_case_id=tc.id
  order by r.started_at desc
  limit 1
) lr on true
left join profiles pr on pr.id=lr.run_by
group by s.id;
