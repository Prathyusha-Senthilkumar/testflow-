-- Multiple suite categories, test-case categories, and applicable environments.
-- Does not drop existing columns or rows.
-- test_cases.category (Functional/Responsive) is left unchanged.
-- test_suites.category stays as the first selected category for older readers.

alter table public.test_suites
  add column if not exists categories text[] not null default '{}';

update public.test_suites
set categories = array[category]
where cardinality(categories) = 0
  and category is not null;

alter table public.test_suites
  drop constraint if exists test_suites_categories_check;

alter table public.test_suites
  add constraint test_suites_categories_check
  check (categories <@ array['smoke', 'sanity', 'regression', 'full_regression']::text[]);

alter table public.test_cases
  add column if not exists categories text[] not null default '{}';

alter table public.test_cases
  drop constraint if exists test_cases_categories_check;

alter table public.test_cases
  add constraint test_cases_categories_check
  check (categories <@ array['smoke', 'sanity', 'regression', 'full_regression']::text[]);

alter table public.test_cases
  add column if not exists environment_ids uuid[] not null default '{}';

update public.test_cases
set environment_ids = array[environment_id]
where environment_id is not null
  and cardinality(environment_ids) = 0;
