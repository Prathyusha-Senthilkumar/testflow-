-- Lock app tables to the service role.
--
-- All data access goes through the FastAPI backend and the Node worker, which use the
-- service-role key (it bypasses RLS). The frontend only uses the anon key for
-- supabase.auth, never for table reads/writes. So app tables get RLS with no policies,
-- any existing anon/authenticated/public policies are dropped, and the anon and
-- authenticated roles lose direct table privileges.
--
-- Safe to re-run. Tables that do not exist in this database are skipped.
-- Apply in the Supabase SQL editor AFTER deploying the backend with API auth enabled.

do $$
declare
  t text;
  pol record;
begin
  foreach t in array array[
    'profiles',
    'projects',
    'test_suites',
    'test_cases',
    'test_suite_cases',
    'test_case_versions',
    'test_runs',
    'environments',
    'auth_profiles'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'skip %: table does not exist', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    for pol in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = t
        and roles && array['anon', 'authenticated', 'public']::name[]
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
      raise notice 'dropped policy % on %', pol.policyname, t;
    end loop;

    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Overview views run with the caller's rights (security_invoker), so they inherit the
-- lockdown above. Revoke direct access as well.
do $$
declare
  v text;
begin
  foreach v in array array['project_overview', 'suite_overview']
  loop
    if to_regclass('public.' || v) is not null then
      execute format('revoke all on table public.%I from anon, authenticated', v);
    end if;
  end loop;
end $$;
