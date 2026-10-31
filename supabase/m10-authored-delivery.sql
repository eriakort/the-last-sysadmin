-- M10: deliver authored missions to the students they're assigned to.
--
-- Run AFTER m6-missions.sql and m7-scenarios.sql. Safe to re-run.
--
-- Why: authored_missions / scenarios are author-only (m6/m7 RLS). A student in a
-- class can't read them directly, so they could never *play* an authored
-- mission. This SECURITY DEFINER function returns exactly the authored missions
-- that are assigned in a class the caller belongs to — nothing else — so the
-- game can load and run them. Assignment mission_ids may name an authored
-- mission directly or a scenario (which expands to its missions); built-in
-- mission ids (e.g. "1-1", "bearings") are ignored here.

begin;

create or replace function public.get_class_missions(p_class_id uuid)
returns setof public.authored_missions
language plpgsql
security definer
set search_path = public
as $$
declare
  ref_ids uuid[];
begin
  -- caller must be a member (student, TA, or owner) of the class
  if not public.is_class_member(p_class_id) then
    return;
  end if;

  -- every uuid-shaped id referenced by this class's assignments
  select coalesce(array_agg(distinct x), '{}')
    into ref_ids
    from (
      select m::uuid as x
      from public.assignments a, unnest(a.mission_ids) m
      where a.class_id = p_class_id
        and m ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) t;

  -- authored missions referenced directly, or via a referenced scenario
  return query
    select am.*
    from public.authored_missions am
    where am.id = any(ref_ids)
       or am.id in (
         select unnest(s.mission_ids)
         from public.scenarios s
         where s.id = any(ref_ids)
       );
end;
$$;

grant execute on function public.get_class_missions(uuid) to authenticated;

commit;
