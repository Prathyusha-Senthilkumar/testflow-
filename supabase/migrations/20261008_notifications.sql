-- In-app notifications (the bell in the top bar) and per-user notification preferences.
--
-- Additive and safe to re-run. Apply in the Supabase SQL editor AFTER 20261008_rls_lockdown.sql.
--
-- Access model matches the RLS lockdown: only the FastAPI backend (service role) reads and
-- writes these tables. RLS is enabled with no policies and anon/authenticated lose privileges.
--
-- user_id is the recipient (a Supabase auth user id, same value as profiles.id and
-- test_runs.run_by). Like the other relationship columns it is a conceptual reference, not a
-- DB-enforced FK; rows for a deleted user are simply never read again.
--
-- Producer: a trigger on test_runs.status. When a run moves into a terminal status and has a
-- run_by, one notification is written for that user (deduplicated per run). The trigger never
-- raises, so a notification problem can never block a run status update.

create extension if not exists "pgcrypto";

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid,
  type text not null,
  severity text not null,
  title text not null,
  body text,
  link text,
  entity_type text,
  entity_id text,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notifications add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notifications_type_check') then
    alter table public.notifications add constraint notifications_type_check
      check (type in ('run_failed', 'run_passed', 'batch_completed', 'run_stuck', 'auth_profile_attention', 'system'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notifications_severity_check') then
    alter table public.notifications add constraint notifications_severity_check
      check (severity in ('info', 'success', 'warning', 'error'));
  end if;
  -- App-relative paths only ("/projects/..."); never an absolute or protocol-relative URL.
  if not exists (select 1 from pg_constraint where conname = 'notifications_link_check') then
    alter table public.notifications add constraint notifications_link_check
      check (link is null or (link like '/%' and link not like '//%'));
  end if;
end $$;

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id) where read_at is null;
create unique index if not exists notifications_user_dedupe_key
  on public.notifications (user_id, dedupe_key) where dedupe_key is not null;

create table if not exists public.notification_preferences (
  user_id uuid primary key,
  run_failed boolean not null default true,
  run_passed boolean not null default false,
  batch_completed boolean not null default true,
  run_stuck boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Lock both tables to the service role (same treatment as 20261008_rls_lockdown.sql).
do $$
declare
  t text;
  pol record;
begin
  foreach t in array array['notifications', 'notification_preferences']
  loop
    execute format('alter table public.%I enable row level security', t);
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
        and roles && array['anon', 'authenticated', 'public']::name[]
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table public.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on table public.%I from authenticated', t);
    end if;
  end loop;
end $$;

-- Error text shown in a notification: secrets-looking fragments redacted, query strings
-- dropped, whitespace collapsed, at most 140 characters.
create or replace function public.testflow_notification_snippet(raw text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select nullif(left(btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(coalesce(raw, ''), '(https?://[^\s?#]+)[?#]\S*', '\1', 'gi'),
          '(bearer|basic)\s+[A-Za-z0-9._~+/=-]+', '\1 [redacted]', 'gi'),
        '(password|passwd|pwd|secret|token|api[_-]?key|authorization|cookie|session|storage_?state)(["'']?\s*[:=]\s*)("[^"]*"|''[^'']*''|\S+)',
        '\1\2[redacted]', 'gi'),
      '\s+', ' ', 'g')
  ), 140), '')
$$;

create or replace function public.testflow_notify_run_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  run_row jsonb;
  case_row jsonb;
  prefs record;
  v_project_id uuid;
  v_case_name text;
  v_error text;
  v_type text;
  v_severity text;
  v_title text;
  v_link text;
  v_minutes text;
begin
  begin
    if new.run_by is null or new.status is not distinct from old.status then
      return new;
    end if;

    -- to_jsonb keeps this working across live/schema.sql drift (optional columns).
    run_row := to_jsonb(new);
    v_error := run_row->>'error_message';

    if new.status = 'Failed' then
      if v_error ilike 'Marked failed: no progress for%' then
        v_type := 'run_stuck';
        v_severity := 'warning';
      else
        v_type := 'run_failed';
        v_severity := 'error';
      end if;
    elsif new.status = 'Passed' then
      v_type := 'run_passed';
      v_severity := 'success';
    else
      -- 'Not Run' (cancelled) and non-terminal statuses produce no notification.
      return new;
    end if;

    select * into prefs from public.notification_preferences p where p.user_id = new.run_by;
    if found then
      if (v_type = 'run_failed' and not prefs.run_failed)
        or (v_type = 'run_passed' and not prefs.run_passed)
        or (v_type = 'run_stuck' and not prefs.run_stuck) then
        return new;
      end if;
    elsif v_type = 'run_passed' then
      return new;  -- default: passed runs are not notified
    end if;

    -- Test case name and project: test_cases.project_id when present, else via the suite.
    select to_jsonb(tc) into case_row from public.test_cases tc where tc.id = new.test_case_id;
    v_case_name := coalesce(nullif(btrim(case_row->>'name'), ''), 'Test case');
    v_project_id := nullif(case_row->>'project_id', '')::uuid;
    if v_project_id is null and nullif(case_row->>'suite_id', '') is not null then
      select s.project_id into v_project_id
      from public.test_suites s where s.id = (case_row->>'suite_id')::uuid;
    end if;

    v_title := case v_type
      when 'run_failed' then 'Test failed: '
      when 'run_stuck' then 'Test stuck: '
      else 'Test passed: '
    end || left(v_case_name, 160);

    v_link := case
      when v_project_id is not null then '/projects/' || v_project_id::text || '/results/' || new.id::text
      else '/runs'
    end;

    if v_type = 'run_stuck' then
      v_minutes := substring(v_error from 'no progress for ([0-9]+) minutes');
    end if;

    insert into public.notifications
      (user_id, project_id, type, severity, title, body, link, entity_type, entity_id, dedupe_key)
    values (
      new.run_by,
      v_project_id,
      v_type,
      v_severity,
      v_title,
      case
        when v_type = 'run_stuck' then 'Marked failed: no progress for ' || coalesce(v_minutes, 'several') || ' minutes'
        when v_type = 'run_failed' then public.testflow_notification_snippet(v_error)
        else null
      end,
      v_link,
      'test_run',
      new.id::text,
      'run:' || new.id::text
    )
    on conflict do nothing;
  exception when others then
    -- Never block the run status update because of a notification.
    raise warning 'testflow_notify_run_status skipped for run %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.testflow_notify_run_status() from public;
revoke all on function public.testflow_notification_snippet(text) from public;

drop trigger if exists test_runs_notify_status on public.test_runs;
create trigger test_runs_notify_status
  after update of status on public.test_runs
  for each row
  when (new.status is distinct from old.status and new.status in ('Passed', 'Failed', 'Not Run'))
  execute function public.testflow_notify_run_status();
