-- Archive projects, suites, and test cases. Archived items are kept and can be restored.
-- Apply in the Supabase SQL editor.

alter table public.projects add column if not exists archived boolean not null default false;
alter table public.test_suites add column if not exists archived boolean not null default false;
alter table public.test_cases add column if not exists archived boolean not null default false;

notify pgrst, 'reload schema';
