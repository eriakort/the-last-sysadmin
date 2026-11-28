-- M14: atomic per-user rate limiting for the AI learning assistant.
-- Only the Edge Function's service-role client can execute the limiter.
-- Safe to re-run.

begin;

create table if not exists public.ai_assist_rate_limits (
  user_id uuid not null,
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (user_id, window_start)
);

alter table public.ai_assist_rate_limits enable row level security;
create index if not exists ai_assist_rate_limits_window on public.ai_assist_rate_limits (window_start);
revoke all on public.ai_assist_rate_limits from public, anon, authenticated;
grant all on public.ai_assist_rate_limits to service_role;

create or replace function public.consume_ai_assist_rate_limit(
  p_user_id uuid,
  p_limit integer default 20
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz := date_trunc('minute', clock_timestamp());
  v_count integer;
begin
  if p_user_id is null or p_limit < 1 or p_limit > 100 then
    return false;
  end if;

  insert into public.ai_assist_rate_limits (user_id, window_start, request_count)
  values (p_user_id, v_window, 1)
  on conflict (user_id, window_start)
  do update set request_count = public.ai_assist_rate_limits.request_count + 1
  returning request_count into v_count;

  -- Opportunistic bounded retention: discard buckets older than two hours.
  delete from public.ai_assist_rate_limits
  where window_start < v_window - interval '2 hours';

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_ai_assist_rate_limit(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_assist_rate_limit(uuid, integer) to service_role;

commit;
