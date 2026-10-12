-- GitHub integration: one linked repository per project, and the issues Attest opened for
-- failed runs. See docs/adr/ADR-019-github-issues.md.
--
-- The token is stored only as a Fernet ciphertext (TESTFLOW_SECRET_KEY). token_hint keeps the
-- last four characters so the UI can show which token is saved without decrypting it.
-- project_id, test_case_id and run_id are conceptual references (not FKs), validated by the API.

create table if not exists public.project_github_connections (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null unique,
    owner text not null,
    repo text not null,
    token_encrypted text not null,
    token_hint text not null default '',
    auto_create_issues boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.github_issues (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null,
    test_case_id uuid,
    -- One row per failed run. Inserting it claims the run, so two backends never file it twice.
    run_id uuid not null unique,
    issue_number integer,
    issue_url text,
    -- pending: being filed; open/closed: mirrors GitHub; error: last attempt failed (retried).
    state text not null default 'pending' check (state in ('pending', 'open', 'closed', 'error')),
    -- true when this run was added as a comment on an issue opened for an earlier run.
    commented boolean not null default false,
    attempts integer not null default 0,
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists github_issues_project_id_idx on public.github_issues (project_id);
create index if not exists github_issues_test_case_open_idx
    on public.github_issues (test_case_id, state);

-- Service role only: the API is the sole reader and writer, and the token must never reach a browser.
alter table public.project_github_connections enable row level security;
alter table public.github_issues enable row level security;

notify pgrst, 'reload schema';
