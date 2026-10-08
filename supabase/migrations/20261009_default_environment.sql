-- Project default environment: one flagged environment per project.
-- Suite and project runs, and new test cases, use it unless another is chosen.
-- Additive and safe to re-run. Apply in the Supabase SQL editor.
--
-- Until this runs the API still works: every environment reads as isDefault=false, the
-- oldest one is treated as the default, and POST .../environments/{id}/default answers 409.

alter table public.environments
  add column if not exists is_default boolean not null default false;

-- At most one default per project. The API clears the old default before setting the new one.
create unique index if not exists environments_one_default_per_project
  on public.environments (project_id)
  where is_default;

-- Backfill: each project without a default gets its oldest environment.
update public.environments as env
set is_default = true
from (
  select distinct on (project_id) id
  from public.environments
  where project_id not in (
    select project_id from public.environments where is_default
  )
  order by project_id, created_at asc nulls last, id
) as oldest
where env.id = oldest.id;

-- Lookups by project already use the project_id index from earlier migrations when present.
create index if not exists environments_project_id_idx on public.environments (project_id);
