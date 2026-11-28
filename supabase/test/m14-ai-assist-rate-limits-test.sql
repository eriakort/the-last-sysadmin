-- M14: atomic AI assistant rate-limit tests.
\set ON_ERROR_STOP on

do $$
declare
  v_user uuid := gen_random_uuid();
  i integer;
begin
  if has_function_privilege('anon', 'public.consume_ai_assist_rate_limit(uuid, integer)', 'EXECUTE') then
    raise exception 'anon must not execute the AI rate limiter';
  end if;
  if has_function_privilege('authenticated', 'public.consume_ai_assist_rate_limit(uuid, integer)', 'EXECUTE') then
    raise exception 'authenticated must not execute the AI rate limiter directly';
  end if;
  if not has_function_privilege('service_role', 'public.consume_ai_assist_rate_limit(uuid, integer)', 'EXECUTE') then
    raise exception 'service_role must execute the AI rate limiter';
  end if;
  for i in 1..20 loop
    if not public.consume_ai_assist_rate_limit(v_user, 20) then
      raise exception 'request % should be allowed', i;
    end if;
  end loop;
  if public.consume_ai_assist_rate_limit(v_user, 20) then
    raise exception 'request 21 should be rate limited';
  end if;
  if public.consume_ai_assist_rate_limit(null, 20) then
    raise exception 'null user must be rejected';
  end if;
  if public.consume_ai_assist_rate_limit(v_user, 0) then
    raise exception 'invalid limit must be rejected';
  end if;
end $$;

select 'ok: AI rate limit allows 20 requests and rejects request 21' as result;
