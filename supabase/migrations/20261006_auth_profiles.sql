-- Additive. Auth Profile records move to Supabase.
-- credentials_enc and storage_state_enc are Fernet tokens from the API.
-- Apply in the Supabase SQL editor. Do not drop the local automation/auth-profiles files.

create table if not exists public.auth_profiles (
  id text primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  login_url text not null default '',
  refresh jsonb,
  credentials_enc text,
  storage_state_enc text,
  created_at timestamptz not null default now()
);

alter table public.auth_profiles enable row level security;
