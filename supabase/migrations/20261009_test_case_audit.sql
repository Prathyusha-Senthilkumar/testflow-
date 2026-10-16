-- Who created and last changed a test case.
-- created_at already exists. updated_at does not on the live table, so add it
-- and start it from created_at until the next edit.
alter table public.test_cases
  add column if not exists updated_at timestamptz,
  add column if not exists created_by uuid references public.profiles(id),
  add column if not exists updated_by uuid references public.profiles(id);

update public.test_cases
set updated_at = created_at
where updated_at is null and created_at is not null;
