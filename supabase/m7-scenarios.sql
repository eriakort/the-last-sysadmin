-- M7: scenarios group authored missions
create table if not exists public.scenarios (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  mission_ids uuid[] not null default '{}',
  created_at  timestamptz not null default now()
);
alter table public.scenarios enable row level security;
create index if not exists scenarios_author on public.scenarios (author_id);

drop policy if exists "authors manage own scenarios" on public.scenarios;
create policy "authors manage own scenarios"
  on public.scenarios for all
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

grant select, insert, update, delete on public.scenarios to authenticated;
