-- Additive Supabase Queue for suite/project batch dispatch.
-- Does not drop tables or change Auth Profiles.
-- Apply once in the Supabase SQL editor. Re-running is safe.

create extension if not exists pgmq;

do $$
begin
  if not exists (
    select 1
    from pgmq.list_queues() as q
    where q.queue_name = 'testflow_batch_dispatch'
  ) then
    perform pgmq.create('testflow_batch_dispatch');
  end if;
end $$;

create or replace function public.testflow_batch_queue_send(batch_id text)
returns bigint
language plpgsql
security definer
set search_path = pgmq, public
as $$
declare
  new_id bigint;
begin
  if batch_id is null or length(btrim(batch_id)) = 0 then
    raise exception 'batch_id is required';
  end if;
  select pgmq.send(
    queue_name => 'testflow_batch_dispatch',
    msg => jsonb_build_object('batchId', batch_id)
  )
  into new_id;
  return new_id;
end;
$$;

create or replace function public.testflow_batch_queue_read(vt integer, qty integer)
returns table (msg_id bigint, message jsonb)
language plpgsql
security definer
set search_path = pgmq, public
as $$
begin
  return query
  select r.msg_id, r.message
  from pgmq.read(
    queue_name => 'testflow_batch_dispatch',
    vt => greatest(vt, 1),
    qty => greatest(qty, 1)
  ) as r;
end;
$$;

create or replace function public.testflow_batch_queue_archive(msg_id bigint)
returns boolean
language plpgsql
security definer
set search_path = pgmq, public
as $$
begin
  return pgmq.archive(
    queue_name => 'testflow_batch_dispatch',
    msg_id => msg_id
  );
end;
$$;

revoke all on function public.testflow_batch_queue_send(text) from public, anon, authenticated;
revoke all on function public.testflow_batch_queue_read(integer, integer) from public, anon, authenticated;
revoke all on function public.testflow_batch_queue_archive(bigint) from public, anon, authenticated;

grant execute on function public.testflow_batch_queue_send(text) to service_role;
grant execute on function public.testflow_batch_queue_read(integer, integer) to service_role;
grant execute on function public.testflow_batch_queue_archive(bigint) to service_role;
