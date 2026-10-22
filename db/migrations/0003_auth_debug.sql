-- =====================================================================
-- VPrep migration 0003: auth_debug() — explains why the database does or
-- doesn't recognise the signed-in user.
--
-- Run once in the SQL Editor. Adds one read-only function; changes no
-- table or data. The app calls it only when a signed-in request is
-- rejected, and logs the result to help find the cause.
-- =====================================================================

begin;

create or replace function public.auth_debug()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_sub   text;
  v_error text;
begin
  begin
    v_sub := auth.user_id();
  exception when others then
    v_error := sqlstate || ': ' || sqlerrm;
  end;

  return jsonb_build_object(
    'db_role',     current_user,
    'sub',         v_sub,
    'sub_is_uuid', coalesce(v_sub ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false),
    'resolved_id', public.current_user_id(),
    'active_profile', public.is_active_user(),
    'error',       v_error,
    'db_time',     now()
  );
end;
$$;

revoke execute on function public.auth_debug() from public;
grant  execute on function public.auth_debug() to anonymous, authenticated;

commit;

notify pgrst, 'reload schema';
