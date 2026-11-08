-- M4: let class staff enroll a student by email.
-- Email lives in auth.users; this SECURITY DEFINER function looks it up
-- and inserts an enrollment. Only class staff may call it, and only for
-- their own class. Role is forced to 'student'.

create or replace function public.enroll_by_email(p_class_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  if not public.is_class_staff(p_class_id) then
    return jsonb_build_object('error', 'not staff of this class');
  end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if uid is null then
    return jsonb_build_object('error', 'no user with that email');
  end if;
  insert into public.enrollments (class_id, user_id, role)
  values (p_class_id, uid, 'student')
  on conflict (class_id, user_id) do nothing;
  return jsonb_build_object('ok', true, 'user_id', uid);
end;
$$;

grant execute on function public.enroll_by_email(uuid, text) to authenticated;
