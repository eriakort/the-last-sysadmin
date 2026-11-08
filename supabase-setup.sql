-- The Last Sysadmin — Supabase schema for accounts, progress sync, and race results.
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run.
-- Safe to re-run (uses IF NOT EXISTS / drop-and-recreate for policies).
--
-- What it creates:
--   profiles       one row per user (public display name)
--   progress       campaign save per user (syncs across devices)
--   race_results   append-only race finishes (powers the all-time leaderboard)
-- Security: Row Level Security (RLS) so each user only writes their OWN rows.
--   Casual integrity: the browser writes its own data, so stats are self-reported
--   (fine for a learning game). RLS still stops anyone writing as someone else.

-- ---------- profiles ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar       text,
  created_at   timestamptz not null default now()
);
-- add the avatar column if you created profiles before this version
alter table public.profiles add column if not exists avatar text;
alter table public.profiles enable row level security;

drop policy if exists "profiles are readable by everyone" on public.profiles;
create policy "profiles are readable by everyone"
  on public.profiles for select using (true);

drop policy if exists "users insert their own profile" on public.profiles;
create policy "users insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "users update their own profile" on public.profiles;
create policy "users update their own profile"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- auto-create a profile row whenever a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- progress (campaign save) ----------
create table if not exists public.progress (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  data       jsonb,
  tickets    int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.progress enable row level security;

drop policy if exists "users read their own progress" on public.progress;
create policy "users read their own progress"
  on public.progress for select using (auth.uid() = user_id);

drop policy if exists "users insert their own progress" on public.progress;
create policy "users insert their own progress"
  on public.progress for insert with check (auth.uid() = user_id);

drop policy if exists "users update their own progress" on public.progress;
create policy "users update their own progress"
  on public.progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- race_results (append-only, public leaderboard) ----------
create table if not exists public.race_results (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  scenario   text not null,
  finish_ms  int  not null check (finish_ms >= 0),
  created_at timestamptz not null default now()
);
alter table public.race_results enable row level security;

drop policy if exists "race results are readable by everyone" on public.race_results;
create policy "race results are readable by everyone"
  on public.race_results for select using (true);

drop policy if exists "users insert their own race results" on public.race_results;
create policy "users insert their own race results"
  on public.race_results for insert with check (auth.uid() = user_id);

create index if not exists race_results_scenario_time
  on public.race_results (scenario, finish_ms);
