-- =====================================================================
-- VPrep migration 0007: admin panel support
--
-- 1. admin_users(): every learner with email, role, suspension, attempts,
--    points and last activity. Emails live in neon_auth."user", which the
--    app can't read directly, so this admin-only function provides them.
-- 2. admin_question_stats(): per question attempts, accuracy inputs and
--    open reports, to spot questions that are too hard or wrong.
-- 3. A question that learners have attempted can't be deleted (that would
--    erase their history); unpublish it instead.
--
-- Run once in the SQL Editor.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Users
-- ---------------------------------------------------------------------
create or replace function public.admin_users()
returns table (
  id           uuid,
  full_name    text,
  email        text,
  state        text,
  country      text,
  role         text,
  is_suspended boolean,
  created_at   timestamptz,
  attempts     bigint,
  points       bigint,
  last_active  timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;

  return query
  with best as (
    select a.user_id, a.question_id, max(public.attempt_points(a.status)) as pts
    from public.attempts a
    join public.questions q on q.id = a.question_id and q.status = 'published'
    group by a.user_id, a.question_id
  ),
  per_user as (
    select a.user_id, count(*) as attempts, max(a.created_at) as last_active
    from public.attempts a
    group by a.user_id
  )
  select p.id, p.full_name, u.email, p.state, p.country, p.role, p.is_suspended, p.created_at,
         coalesce(pu.attempts, 0)::bigint,
         coalesce((select sum(b.pts) from best b where b.user_id = p.id), 0)::bigint,
         pu.last_active
  from public.profiles p
  join neon_auth."user" u on u.id = p.id
  left join per_user pu on pu.user_id = p.id
  order by p.created_at desc;
end;
$$;

revoke execute on function public.admin_users() from public, anonymous;
grant  execute on function public.admin_users() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Question stats
-- ---------------------------------------------------------------------
create or replace function public.admin_question_stats()
returns table (
  question_id  uuid,
  attempts     bigint,
  learners     bigint,
  answered     bigint,
  correct      bigint,
  revealed     bigint,
  skipped      bigint,
  open_reports bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;

  return query
  select q.id,
         count(a.id)::bigint,
         count(distinct a.user_id)::bigint,
         (count(a.id) filter (where a.status in ('independent', 'hint', 'incorrect')))::bigint,
         (count(a.id) filter (where a.status in ('independent', 'hint')))::bigint,
         (count(a.id) filter (where a.status = 'revealed'))::bigint,
         (count(a.id) filter (where a.status = 'skipped'))::bigint,
         (select count(*) from public.reports r where r.question_id = q.id and r.status = 'open')::bigint
  from public.questions q
  left join public.attempts a on a.question_id = q.id
  group by q.id;
end;
$$;

revoke execute on function public.admin_question_stats() from public, anonymous;
grant  execute on function public.admin_question_stats() to authenticated;

-- ---------------------------------------------------------------------
-- 3. Protect learners' history
-- ---------------------------------------------------------------------
create or replace function public.prevent_delete_attempted_question()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.attempts a where a.question_id = old.id) then
    raise exception 'Question % has attempts from learners. Unpublish it instead of deleting it.', old.code;
  end if;
  return old;
end;
$$;

create trigger questions_prevent_delete_attempted
  before delete on public.questions
  for each row execute function public.prevent_delete_attempted_question();

revoke execute on function public.prevent_delete_attempted_question() from public, anonymous, authenticated;

commit;

notify pgrst, 'reload schema';
