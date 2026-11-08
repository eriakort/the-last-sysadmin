-- The Last Sysadmin — M2: join-a-class-by-code.
--
-- Run AFTER m1-classroom.sql. Safe to re-run.
--
-- Why a function is needed: a student who is not yet enrolled CANNOT read the
-- class row (the classes SELECT policy only reveals classes you own or belong
-- to), so they can't turn a join code into a class_id on the client. This
-- SECURITY DEFINER function does the lookup-and-enroll atomically on the
-- server, without opening class rows up to the world.
--
-- It is safe despite bypassing RLS: it ALWAYS enrolls auth.uid() (never an
-- arbitrary user) and ALWAYS as 'student' (never a TA), and it only ever reads
-- a class by its exact secret code. Granted to authenticated only.

begin;

-- OUT columns are deliberately NOT named class_id/class_name: a plpgsql OUT
-- parameter that shares a name with a column referenced in the body (e.g. the
-- enrollments.class_id in the INSERT) is ambiguous and errors at runtime.
create or replace function public.enroll_by_code(code text)
returns table (cid uuid, cname text, already_enrolled boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.classes%rowtype;
  norm text := upper(regexp_replace(coalesce(code, ''), '\s', '', 'g'));
  existed boolean;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to join a class' using errcode = '28000';
  end if;
  if norm = '' then
    raise exception 'Enter a join code' using errcode = '22023';
  end if;

  select * into c from public.classes where join_code = norm;
  if not found then
    raise exception 'That join code is not valid' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.enrollments e
    where e.class_id = c.id and e.user_id = auth.uid()
  ) into existed;

  insert into public.enrollments (class_id, user_id, role)
  values (c.id, auth.uid(), 'student')
  on conflict (class_id, user_id) do nothing;

  cid := c.id;
  cname := c.name;
  already_enrolled := existed;
  return next;
end;
$$;

grant execute on function public.enroll_by_code(text) to authenticated;

commit;
