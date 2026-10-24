-- =====================================================================
-- VPrep migration 0008: leaderboard privacy
--
-- The leaderboard is public (signed-out visitors can open it), so it no
-- longer shows full names or account ids:
--   * display_name: first name + initial of the last name ("Vishesh S.").
--   * is_me: true on the caller's own row, replacing user_id.
--   * Learners with 0 points are not listed, so a new sign-up doesn't
--     appear on a public page until they have practised.
--
-- The return columns change, so the function is dropped and recreated.
-- Until the app is updated for these columns the leaderboard page shows
-- blank names; update the app right after running this.
--
-- Run once in the SQL Editor.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Short name
-- ---------------------------------------------------------------------
create or replace function public.leaderboard_name(p_full_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when cardinality(w) = 0 then 'Learner'
           when cardinality(w) = 1 then left(w[1], 30)
           else left(w[1], 30) || ' ' || upper(left(w[cardinality(w)], 1)) || '.'
         end
  from (
    select array_remove(regexp_split_to_array(btrim(coalesce(p_full_name, '')), '\s+'), '') as w
  ) s
$$;

revoke execute on function public.leaderboard_name(text) from public, anonymous, authenticated;

-- ---------------------------------------------------------------------
-- 2. Leaderboard
-- ---------------------------------------------------------------------
drop function if exists public.get_leaderboard(text, text, integer);

create function public.get_leaderboard(
  p_country text default null,
  p_state   text default null,
  p_limit   integer default 100
)
returns table (
  rank         bigint,
  display_name text,
  state        text,
  country      text,
  points       bigint,
  is_me        boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with best as (
    select a.user_id, a.question_id, max(public.attempt_points(a.status)) as pts
    from public.attempts a
    join public.questions q on q.id = a.question_id and q.status = 'published'
    group by a.user_id, a.question_id
  ),
  totals as (
    select b.user_id, sum(b.pts)::bigint as points
    from best b
    group by b.user_id
  ),
  me as (
    select public.current_user_id() as id
  )
  select
    rank() over (order by t.points desc) as rank,
    public.leaderboard_name(p.full_name),
    p.state,
    p.country,
    t.points,
    coalesce(p.id = me.id, false)
  from public.profiles p
  join totals t on t.user_id = p.id
  cross join me
  where t.points > 0
    and not p.is_suspended
    and (p_country is null or p.country = p_country)
    and (p_state is null or p.state = p_state)
  order by rank, p.created_at
  limit greatest(1, least(coalesce(p_limit, 100), 500))
$$;

revoke execute on function public.get_leaderboard(text, text, integer) from public;
grant  execute on function public.get_leaderboard(text, text, integer) to anonymous, authenticated;

commit;

notify pgrst, 'reload schema';
