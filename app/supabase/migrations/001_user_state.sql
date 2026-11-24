-- Level Up: one synced document per account.
-- Run this once in your Supabase project: Dashboard > SQL Editor > New query > paste > Run.

create table if not exists public.user_state (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  state      jsonb not null,
  -- Opaque token that changes on every write; used for optimistic concurrency.
  version    text  not null,
  updated_at timestamptz not null default now(),
  -- Guard against runaway payloads (a busy year of data is well under 1 MB).
  constraint user_state_size check (octet_length(state::text) < 5000000)
);

alter table public.user_state enable row level security;

-- Each person can only ever see and change their own row.
drop policy if exists "own row: select" on public.user_state;
drop policy if exists "own row: insert" on public.user_state;
drop policy if exists "own row: update" on public.user_state;
drop policy if exists "own row: delete" on public.user_state;

create policy "own row: select" on public.user_state
  for select to authenticated using (auth.uid() = user_id);
create policy "own row: insert" on public.user_state
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own row: update" on public.user_state
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row: delete" on public.user_state
  for delete to authenticated using (auth.uid() = user_id);

create or replace function public.touch_user_state() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists user_state_touch on public.user_state;
create trigger user_state_touch before update on public.user_state
  for each row execute function public.touch_user_state();
