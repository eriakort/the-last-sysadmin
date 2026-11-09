-- Network Trainer — classroom: authored network scenarios + delivery.
--
-- Run AFTER m10-authored-delivery.sql (and therefore after m1, m2, m4,
-- m6 and m7). Safe to re-run.
--
-- Classroom tables and assignments are shared with the Linux application.
-- This adds a network-specific scenario store and a guarded delivery function.
-- Assignment mission_ids may mix built-in ids, authored Linux mission UUIDs,
-- and network scenario UUIDs; each game's delivery function returns only its
-- own records.

begin;

create table if not exists public.net_scenarios (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.net_scenarios enable row level security;
create index if not exists net_scenarios_author on public.net_scenarios (author_id);

drop policy if exists "authors manage own net scenarios" on public.net_scenarios;
create policy "authors manage own net scenarios"
  on public.net_scenarios for all
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

grant select, insert, update, delete on public.net_scenarios to authenticated;

create or replace function public.get_class_net_scenarios(p_class_id uuid)
returns setof public.net_scenarios
language plpgsql
security definer
set search_path = public
as $$
declare
  ref_ids uuid[];
begin
  if not public.is_class_member(p_class_id) then
    return;
  end if;

  select coalesce(array_agg(distinct x), '{}')
    into ref_ids
    from (
      select m::uuid as x
      from public.assignments a, unnest(a.mission_ids) m
      where a.class_id = p_class_id
        and m ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) t;

  return query
    select ns.*
    from public.net_scenarios ns
    where ns.id = any(ref_ids);
end;
$$;

-- PostgreSQL grants function execution to PUBLIC by default. Do not leave
-- this SECURITY DEFINER entry point executable by anonymous callers.
revoke all on function public.get_class_net_scenarios(uuid) from public;
revoke all on function public.get_class_net_scenarios(uuid) from anon;
grant execute on function public.get_class_net_scenarios(uuid) to authenticated;

commit;
