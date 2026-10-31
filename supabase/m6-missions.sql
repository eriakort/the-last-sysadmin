-- M6: authored missions (no-code editor)
create table if not exists public.authored_missions (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  story       text not null default '',
  objective   text not null default '',
  hints       text[] not null default '{}',
  check_type  text not null,
  check_arg1  text,
  check_arg2  text,
  created_at  timestamptz not null default now()
);
alter table public.authored_missions enable row level security;
create index if not exists authored_missions_author on public.authored_missions (author_id);

-- Author can CRUD their own; class staff can read missions used in their classes (later).
drop policy if exists "authors manage own missions" on public.authored_missions;
create policy "authors manage own missions"
  on public.authored_missions for all
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

grant select, insert, update, delete on public.authored_missions to authenticated;
