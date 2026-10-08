-- Workers page: depth of the suite/project batch queue (pgmq testflow_batch_dispatch).
-- Additive and read-only. Re-running is safe. Requires 20261007_batch_queue.sql.
-- Returns visible plus in-flight (read but not archived) messages.

create or replace function public.testflow_batch_queue_depth()
returns bigint
language sql
stable
security definer
set search_path = pgmq, public
as $$
  select coalesce(
    (select queue_length from pgmq.metrics('testflow_batch_dispatch')),
    0
  );
$$;

revoke all on function public.testflow_batch_queue_depth() from public, anon, authenticated;
grant execute on function public.testflow_batch_queue_depth() to service_role;
