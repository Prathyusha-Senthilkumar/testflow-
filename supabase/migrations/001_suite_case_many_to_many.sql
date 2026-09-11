-- Run this only if an existing Supabase database was created from the older schema.
-- It preserves existing suite membership while introducing project-owned test cases and many-to-many suites.

alter table public.projects add column if not exists updated_at timestamptz default now();
alter table public.test_suites add column if not exists source text default 'Manual';
alter table public.test_cases add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.test_cases add column if not exists automation_status text default 'Not Configured';
alter table public.test_cases add column if not exists suggested_suite_name text;
alter table public.test_cases add column if not exists updated_at timestamptz default now();

-- Populate project ownership from the legacy suite_id relationship if it exists.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='test_cases' and column_name='suite_id'
  ) then
    execute '
      update public.test_cases tc
      set project_id = s.project_id
      from public.test_suites s
      where tc.suite_id = s.id and tc.project_id is null';
  end if;
end $$;

create table if not exists public.test_suite_cases (
  test_suite_id uuid not null references public.test_suites(id) on delete cascade,
  test_case_id uuid not null references public.test_cases(id) on delete cascade,
  primary key (test_suite_id, test_case_id)
);

-- Copy the legacy suite_id membership into the mapping table without deleting the legacy column.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='test_cases' and column_name='suite_id'
  ) then
    execute '
      insert into public.test_suite_cases(test_suite_id, test_case_id)
      select suite_id, id from public.test_cases
      where suite_id is not null
      on conflict do nothing';
  end if;
end $$;

-- Recreate views using project ownership + mapping table.
create or replace view public.project_overview as
select
  p.id,p.name,p.base_url,p.description,p.created_at,
  count(distinct s.id)::int suites,
  count(distinct tc.id)::int cases,
  count(distinct tc.id) filter(where lr.status='Passed')::int passed,
  count(distinct tc.id) filter(where lr.status='Failed')::int failed,
  case when count(distinct tc.id)=0 then 0 else round(100.0*count(distinct tc.id) filter(where lr.status='Passed')/count(distinct tc.id)) end::int pass_rate,
  max(lr.completed_at) last_run,
  max(pr.name) filter(where lr.completed_at is not null) last_run_by
from projects p
left join test_suites s on s.project_id=p.id
left join test_cases tc on tc.project_id=p.id
left join lateral (select r.* from test_runs r where r.test_case_id=tc.id order by r.started_at desc limit 1) lr on true
left join profiles pr on pr.id=lr.run_by
group by p.id;

create or replace view public.suite_overview as
select
  s.id,s.project_id,s.name,
  count(tc.id)::int cases,
  count(tc.id) filter(where lr.status='Passed')::int passed,
  count(tc.id) filter(where lr.status='Failed')::int failed,
  count(tc.id) filter(where lr.status is null or lr.status='Not Run')::int not_run,
  case when count(tc.id)=0 then 0 else round(100.0*count(tc.id) filter(where lr.status='Passed')/count(tc.id)) end::int pass_rate,
  max(lr.completed_at) last_run,
  max(pr.name) filter(where lr.completed_at is not null) last_run_by
from test_suites s
left join test_suite_cases stc on stc.test_suite_id=s.id
left join test_cases tc on tc.id=stc.test_case_id
left join lateral (select r.* from test_runs r where r.test_case_id=tc.id order by r.started_at desc limit 1) lr on true
left join profiles pr on pr.id=lr.run_by
group by s.id;
