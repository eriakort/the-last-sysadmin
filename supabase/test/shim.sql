-- Minimal shim reproducing the parts of Supabase our migration depends on,
-- so the SAME policies run here as in production.
--
-- This is for LOCAL TESTING ONLY (see supabase/test/run.sh). It is never run
-- in your Supabase project — Supabase already provides the auth schema, the
-- anon/authenticated roles, and auth.uid()/auth.jwt(). We recreate just enough
-- of them to exercise the real RLS policies under a stand-in Postgres.

-- API roles (NOT superuser, NOT bypassrls — so RLS actually applies to them)
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- auth schema + auth.users (profiles FKs reference it) + auth.uid()/jwt()
create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- Real Supabase reads the request JWT from a GUC. We replicate that exactly:
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
