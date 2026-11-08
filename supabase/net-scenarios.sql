-- Network Trainer — classroom: authored network scenarios + delivery.
--
-- Run AFTER the sysadmin classroom migrations (m1-classroom, m2-enrollment,
-- m6-missions, m7-scenarios, m10-authored-delivery). Safe to re-run.
--
-- Design: the classroom tables are shared and generic. `classes`,
-- `enrollments`, `assignments` (mission_ids text[]) and `attempts`
-- (mission_id text) are reused unchanged. A network scenario is just another
-- authorable, assignable thing, so this adds ONE table (net_scenarios) and ONE
-- SECURITY DEFINER delivery function that mirrors get_class_missions.
--
-- Because assignments.mission_ids is a generic text[], one assignment can
-- reference sysadmin authored missions AND network scenarios at once; each
-- game's delivery function returns only the ids it owns and ignores the rest.
--
-- RLS mirrors m6-missions: an author fully controls their own scenarios, and a
-- student can never read a raw scenario — they only receive the ones assigned
-- to a class they belong to, via get_class_net_scenarios.

begin;

-- ======================================================================
-- net_scenarios: a saved, authorable network scenario (the builder's JSON)
-- ======================================================================
create table if not exists public.net_scenarios (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  data       jsonb not null,                 -- full scenario: start topology + success spec + framing
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.net_scenarios enable row level security;
create index if not exists net_scenarios_author on public.net_scenarios (author_id);

-- Author can CRUD their own scenarios; nobody else can read them directly.
drop policy if exists "authors manage own net scenarios" on public.net_scenarios;
create policy "authors manage own net scenarios"
  on public.net_scenarios for all
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

grant select, insert, update, delete on public.net_scenarios to authenticated;

-- ======================================================================
-- get_class_net_scenarios: deliver assigned scenarios to a class's members
-- ======================================================================
-- A student in a class can't read net_scenarios directly (author-only RLS), so
-- they could never play an assigned scenario. This returns exactly the network
-- scenarios referenced by the class's assignments, and only to a caller who
-- belongs to the class — nothing else. Non-uuid ids (built-in mission ids) and
-- uuids that aren't network scenarios (e.g. sysadmin authored missions) are
-- ignored here, exactly as get_class_missions ignores network ones.
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

  -- network scenarios are assigned directly by id (the sysadmin `scenarios`
  -- grouping table holds authored_mission ids, not net_scenario ids).
  return query
    select ns.*
    from public.net_scenarios ns
    where ns.id = any(ref_ids);
end;
$$;

grant execute on function public.get_class_net_scenarios(uuid) to authenticated;

commit;
