-- Indexes for the relationship columns the API filters and joins on.
-- Additive and safe to re-run. Apply in the Supabase SQL editor.
--
-- The live database and schema.sql have drifted (e.g. live test_cases has suite_id,
-- schema.sql/001 add project_id; test_suite_cases may not exist everywhere), so every
-- index is created only when its table and columns exist.

create or replace function pg_temp.testflow_index_if_columns(
  index_name text,
  table_name text,
  columns text[],
  definition text
) returns void
language plpgsql
as $$
begin
  if to_regclass('public.' || table_name) is null then
    raise notice 'skip %: table public.% does not exist', index_name, table_name;
    return;
  end if;
  if (
    select count(*)
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = testflow_index_if_columns.table_name
      and c.column_name = any(columns)
  ) < array_length(columns, 1) then
    raise notice 'skip %: missing column on public.%', index_name, table_name;
    return;
  end if;
  execute format('create index if not exists %I on public.%I %s', index_name, table_name, definition);
end;
$$;

-- Worker and API look runs up by queue job id on every status update / poll.
select pg_temp.testflow_index_if_columns(
  'test_runs_job_id_idx', 'test_runs', array['job_id'], '(job_id)');
-- Latest run per case (overview views, history, project latest).
select pg_temp.testflow_index_if_columns(
  'test_runs_test_case_started_idx', 'test_runs', array['test_case_id', 'started_at'],
  '(test_case_id, started_at desc)');
-- Stuck-run sweep: non-terminal rows by age.
select pg_temp.testflow_index_if_columns(
  'test_runs_status_started_idx', 'test_runs', array['status', 'started_at'],
  '(status, started_at)');

select pg_temp.testflow_index_if_columns(
  'test_cases_suite_id_idx', 'test_cases', array['suite_id'], '(suite_id)');
select pg_temp.testflow_index_if_columns(
  'test_cases_project_id_idx', 'test_cases', array['project_id'], '(project_id)');

select pg_temp.testflow_index_if_columns(
  'test_suites_project_id_idx', 'test_suites', array['project_id'], '(project_id)');

select pg_temp.testflow_index_if_columns(
  'environments_project_id_idx', 'environments', array['project_id'], '(project_id)');

-- The primary key is (test_suite_id, test_case_id); lookups by case need their own index.
select pg_temp.testflow_index_if_columns(
  'test_suite_cases_test_case_id_idx', 'test_suite_cases', array['test_case_id'], '(test_case_id)');

select pg_temp.testflow_index_if_columns(
  'test_case_versions_case_version_idx', 'test_case_versions',
  array['test_case_id', 'version_number'], '(test_case_id, version_number)');

select pg_temp.testflow_index_if_columns(
  'auth_profiles_project_id_idx', 'auth_profiles', array['project_id'], '(project_id)');
