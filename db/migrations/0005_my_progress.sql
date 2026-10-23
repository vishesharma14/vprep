-- =====================================================================
-- VPrep migration 0005: my_progress() for the Progress dashboard
--
-- One call returns everything the Progress page and Home need, counted in
-- the database (so it stays fast with thousands of attempts):
--   totals, today's count vs daily goal, current and best streak,
--   attempts per day for the last N days, and per-subject / per-topic stats.
-- Days and streaks use the learner's time zone (default Asia/Kolkata).
-- Only the signed-in learner's own attempts on published questions count.
--
-- Run once in the SQL Editor. Adds one read-only function.
-- =====================================================================

begin;

create or replace function public.my_progress(
  p_tz   text    default 'Asia/Kolkata',
  p_days integer default 14
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid    uuid := public.current_user_id();
  v_tz     text := 'Asia/Kolkata';
  v_days   integer := greatest(1, least(coalesce(p_days, 14), 90));
  v_today  date;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Sign in to see your progress';
  end if;

  -- Use the requested time zone only if Postgres knows it.
  if p_tz is not null and exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz) then
    v_tz := p_tz;
  end if;
  v_today := (now() at time zone v_tz)::date;

  with att as (
    -- Runs with the caller's rights: RLS hides unpublished questions, and the
    -- user filter keeps admins (who can read all attempts) to their own.
    select a.question_id, a.status, a.time_spent_ms,
           (a.created_at at time zone v_tz)::date as day,
           q.topic_id
    from public.attempts a
    join public.questions q on q.id = a.question_id
    where a.user_id = v_uid
  ),
  days as (
    select distinct day from att
  ),
  islands as (
    -- Consecutive days share the same grp value.
    select day, day + (row_number() over (order by day desc))::integer as grp
    from days
  ),
  anchor as (
    -- A streak is still alive if the learner practised today or yesterday.
    select max(day) as last_day from days
  ),
  streak as (
    select
      coalesce((
        select count(*) from islands i
        where i.grp = (select i2.grp from islands i2, anchor where i2.day = anchor.last_day)
          and (select last_day from anchor) >= v_today - 1
      ), 0)::integer as current_streak,
      coalesce((select max(n) from (select count(*) as n from islands group by grp) s), 0)::integer as best_streak
  ),
  open_mistakes as (
    -- Open = wrong at some point and not solved correctly afterwards.
    select distinct a.topic_id, a.question_id
    from att a
    where a.status = 'incorrect'
      and not exists (
        select 1 from public.attempts c
        where c.user_id = v_uid and c.question_id = a.question_id
          and c.status in ('independent', 'hint')
          and c.created_at > (select max(w.created_at) from public.attempts w
                              where w.user_id = v_uid and w.question_id = a.question_id and w.status = 'incorrect')
      )
  ),
  per_topic as (
    select t.id as topic_id, t.name as topic_name, s.id as subject_id, s.name as subject_name,
           e.slug as exam_slug, e.name as exam_name,
           count(distinct att.question_id)::integer                                            as attempted,
           (count(*) filter (where att.status in ('independent', 'hint', 'incorrect')))::integer as answered,
           (count(*) filter (where att.status in ('independent', 'hint')))::integer              as correct,
           (select count(*) from open_mistakes m where m.topic_id = t.id)::integer               as open_mistakes
    from att
    join public.topics t   on t.id = att.topic_id
    join public.subjects s on s.id = t.subject_id
    join public.exams e    on e.id = s.exam_id
    group by t.id, t.name, s.id, s.name, e.slug, e.name
  ),
  per_subject as (
    select subject_id, subject_name, exam_slug, exam_name,
           sum(attempted)::integer as attempted,
           sum(answered)::integer  as answered,
           sum(correct)::integer   as correct
    from per_topic
    group by subject_id, subject_name, exam_slug, exam_name
  ),
  daily as (
    select g.day::date as day,
           (select count(*) from att where att.day = g.day::date)::integer as attempts,
           (select count(*) from att where att.day = g.day::date and att.status in ('independent', 'hint'))::integer as correct
    from generate_series(v_today - (v_days - 1), v_today, interval '1 day') as g(day)
  )
  select jsonb_build_object(
    'time_zone', v_tz,
    'today', v_today,
    'daily_goal', (select p.daily_goal from public.profiles p where p.id = v_uid),
    'today_count', (select count(*) from att where day = v_today),
    'totals', (
      select jsonb_build_object(
        'attempts',         count(*),
        'unique_questions', count(distinct question_id),
        'independent',      count(*) filter (where status = 'independent'),
        'hint',             count(*) filter (where status = 'hint'),
        'revealed',         count(*) filter (where status = 'revealed'),
        'incorrect',        count(*) filter (where status = 'incorrect'),
        'skipped',          count(*) filter (where status = 'skipped'),
        'time_ms',          coalesce(sum(time_spent_ms), 0)
      ) from att
    ),
    'streak', (select jsonb_build_object('current', current_streak, 'best', best_streak) from streak),
    'last_active_day', (select last_day from anchor),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'attempts', attempts, 'correct', correct) order by day) from daily), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(ps) order by ps.exam_name, ps.subject_name) from per_subject ps), '[]'::jsonb),
    'topics', coalesce((select jsonb_agg(to_jsonb(pt) order by pt.exam_name, pt.subject_name, pt.topic_name) from per_topic pt), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function public.my_progress(text, integer) from public, anonymous;
grant  execute on function public.my_progress(text, integer) to authenticated;

commit;

notify pgrst, 'reload schema';
