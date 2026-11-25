-- Level Up connector (AI chat apps). Run after 001_user_state.sql.
-- These tables are only ever touched by the connector server using the
-- service-role key. Row-level security is ON with NO policies, so the
-- public anon key (used by the app) can't read or write them at all.

create table if not exists public.oauth_clients (
  client_id  text primary key,
  info       jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.oauth_pending (
  id         text primary key,
  data       jsonb not null,
  expires_at timestamptz not null
);

create table if not exists public.oauth_codes (
  code_hash  text primary key,           -- sha256 of the code; raw codes are never stored
  data       jsonb not null,
  expires_at timestamptz not null
);

create table if not exists public.oauth_tokens (
  token_hash   text primary key,         -- sha256 of the token; raw tokens are never stored
  kind         text not null check (kind in ('access', 'refresh', 'rotated')),
  user_id      uuid not null references auth.users (id) on delete cascade,
  client_id    text not null references public.oauth_clients (client_id) on delete cascade,
  scopes       text[] not null default '{}',
  resource     text,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists oauth_tokens_user_client on public.oauth_tokens (user_id, client_id);

create table if not exists public.activity_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  client_id   text not null,
  client_name text not null,
  tool        text not null,
  summary     text not null check (char_length(summary) <= 500),
  created_at  timestamptz not null default now()
);
create index if not exists activity_log_user_time on public.activity_log (user_id, created_at desc);

alter table public.oauth_clients enable row level security;
alter table public.oauth_pending enable row level security;
alter table public.oauth_codes   enable row level security;
alter table public.oauth_tokens  enable row level security;
alter table public.activity_log  enable row level security;

-- Housekeeping: call periodically (e.g. Supabase > Database > Cron, daily).
create or replace function public.levelup_cleanup() returns void
language sql security definer set search_path = public as $$
  delete from oauth_pending where expires_at < now();
  delete from oauth_codes   where expires_at < now();
  delete from oauth_tokens  where expires_at < now();
  delete from activity_log  where created_at < now() - interval '180 days';
$$;
revoke all on function public.levelup_cleanup() from public, anon, authenticated;
