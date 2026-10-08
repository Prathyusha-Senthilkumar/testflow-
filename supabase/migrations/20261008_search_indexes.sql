-- Trigram indexes for global search (GET /api/search), which filters with
-- ilike '%text%'. A btree index cannot serve a leading wildcard; gin_trgm_ops can.
-- Additive and safe to re-run. Apply in the Supabase SQL editor.
--
-- The case code column is test_case_code on the live database and code in schema.sql,
-- so each index is created only when its table and column exist.

create extension if not exists pg_trgm;

create or replace function pg_temp.testflow_trgm_index_if_column(
  index_name text,
  table_name text,
  column_name text
) returns void
language plpgsql
as $$
begin
  if to_regclass('public.' || table_name) is null then
    raise notice 'skip %: table public.% does not exist', index_name, table_name;
    return;
  end if;
  if not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = testflow_trgm_index_if_column.table_name
      and c.column_name = testflow_trgm_index_if_column.column_name
  ) then
    raise notice 'skip %: missing column %.%', index_name, table_name, column_name;
    return;
  end if;
  execute format(
    'create index if not exists %I on public.%I using gin (%I gin_trgm_ops)',
    index_name, table_name, column_name
  );
end;
$$;

select pg_temp.testflow_trgm_index_if_column('projects_name_trgm_idx', 'projects', 'name');
select pg_temp.testflow_trgm_index_if_column('projects_base_url_trgm_idx', 'projects', 'base_url');
select pg_temp.testflow_trgm_index_if_column('test_suites_name_trgm_idx', 'test_suites', 'name');
select pg_temp.testflow_trgm_index_if_column('test_cases_name_trgm_idx', 'test_cases', 'name');
select pg_temp.testflow_trgm_index_if_column('test_cases_test_case_code_trgm_idx', 'test_cases', 'test_case_code');
select pg_temp.testflow_trgm_index_if_column('test_cases_code_trgm_idx', 'test_cases', 'code');
