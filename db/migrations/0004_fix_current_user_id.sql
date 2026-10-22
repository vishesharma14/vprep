-- =====================================================================
-- VPrep migration 0004: make current_user_id() reliable on Neon
--
-- Problem (found with auth_debug(): db_role "authenticated",
-- error "42501: permission denied for schema auth"):
-- on Neon the `auth` schema of pg_session_jwt is owned by Neon's internal
-- admin role, and `authenticated` / `anonymous` have no USAGE on it
-- (github.com/neondatabase/pg_session_jwt/issues/51). current_user_id() ran
-- with the caller's rights, so auth.user_id() failed and the user looked
-- signed out. It only worked when a cached plan from an earlier privileged
-- call existed on that connection, so failures were intermittent and most
-- common after Neon woke from idle with fresh connections.
--
-- Fix:
-- 1. Read the user id from request.jwt.claims first. The Data API sets it,
--    PostgREST-style, from the JWT it has already verified; it is the same
--    value auth.user_id() returns, and needs no access to the `auth` schema.
-- 2. Fall back to auth.user_id().
-- 3. Run as SECURITY DEFINER (the database owner can use the `auth` schema).
--    The function still only returns the caller's own user id, so this
--    grants nothing extra.
-- auth_debug() also reports what request.jwt.claims contains.
--
-- Run once in the SQL Editor. Replaces two functions; no table or data.
-- =====================================================================

begin;

create or replace function public.current_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sub text;
begin
  -- 1. Claims set by the Data API for this request.
  begin
    v_sub := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
  exception when others then
    v_sub := null;
  end;

  -- 2. pg_session_jwt.
  if v_sub is null then
    begin
      v_sub := auth.user_id();
    exception when others then
      v_sub := null;
    end;
  end if;

  if v_sub ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_sub::uuid;
  end if;
  return null;
end;
$$;

revoke execute on function public.current_user_id() from public;
grant  execute on function public.current_user_id() to anonymous, authenticated;

create or replace function public.auth_debug()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_sub    text;
  v_error  text;
  v_claims text;
begin
  begin
    v_sub := auth.user_id();
  exception when others then
    v_error := sqlstate || ': ' || sqlerrm;
  end;
  v_claims := nullif(current_setting('request.jwt.claims', true), '');

  return jsonb_build_object(
    'db_role',        current_user,
    'sub',            v_sub,
    'sub_is_uuid',    coalesce(v_sub ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false),
    'claims_present', v_claims is not null,
    'claims_sub',     case when v_claims is null then null else (v_claims::jsonb ->> 'sub') end,
    'claims_role',    case when v_claims is null then null else (v_claims::jsonb ->> 'role') end,
    'resolved_id',    public.current_user_id(),
    'active_profile', public.is_active_user(),
    'error',          v_error,
    'db_time',        now()
  );
end;
$$;

revoke execute on function public.auth_debug() from public;
grant  execute on function public.auth_debug() to anonymous, authenticated;

commit;

notify pgrst, 'reload schema';

-- Check (run separately): both rows should say true
-- select proname, prosecdef from pg_proc where proname in ('current_user_id', 'is_admin');
