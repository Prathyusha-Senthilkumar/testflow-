-- Suite category used by Run Project. Existing rows become regression.

alter table public.test_suites
  add column if not exists category text not null default 'regression';

alter table public.test_suites drop constraint if exists test_suites_category_check;

alter table public.test_suites
  add constraint test_suites_category_check
  check (category in ('smoke', 'sanity', 'regression', 'full_regression'));
