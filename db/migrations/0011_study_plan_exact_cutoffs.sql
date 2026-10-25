-- =====================================================================
-- VPrep migration 0011: exact cut-offs in recommend_topics()
--
-- 0010 rounded mastery to "real" before comparing it with the cut-offs
-- 0.5 / 0.6 / 0.7 / 0.85. real(0.7) is 0.69999998..., so a mastery of
-- exactly 0.7 (for example 6 of 8 answers solved without help) got a 3-day
-- review interval instead of 7. The model now works in exact numeric and
-- only rounds to real in the returned columns. Nothing else changes.
--
-- Run once in the SQL Editor, after 0010.
-- =====================================================================

begin;

create or replace function public.recommend_topics(
  p_limit integer default 3,
  p_tz    text    default 'Asia/Kolkata'
)
returns table (
  topic_id        uuid,
  topic_name      text,
  subject_name    text,
  exam_slug       text,
  exam_name       text,
  kind            text,
  mastery         real,
  answered        integer,
  open_mistakes   integer,
  days_since      integer,
  review_interval integer,
  new_questions   integer,
  score           real
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid   uuid := public.current_user_id();
  v_today date;
begin
  if v_uid is null then
    raise exception 'Sign in to get a study plan';
  end if;

  begin
    v_today := (now() at time zone p_tz)::date;
  exception when others then
    raise exception 'Unknown time zone: %', p_tz;
  end;

  return query
  with pub as (
    select q.id, q.topic_id
    from public.questions q
    where q.status = 'published'
  ),
  mine as (
    select a.question_id, p.topic_id, a.status, a.created_at
    from public.attempts a
    join pub p on p.id = a.question_id
    where a.user_id = v_uid
  ),
  latest as (
    -- The latest real answer to each question (skips don't count).
    select distinct on (m.question_id) m.question_id, m.topic_id, m.status
    from mine m
    where m.status <> 'skipped'
    order by m.question_id, m.created_at desc
  ),
  answers as (
    select l.topic_id,
           count(*)::integer as answered,
           sum(case l.status when 'independent' then 1.0 when 'hint' then 0.6 else 0 end) as credit
    from latest l
    group by l.topic_id
  ),
  touched as (
    select m.topic_id, max(m.created_at) as last_at, count(distinct m.question_id)::integer as tried
    from mine m
    group by m.topic_id
  ),
  last_wrong as (
    select m.question_id, m.topic_id, max(m.created_at) as at
    from mine m
    where m.status = 'incorrect'
    group by m.question_id, m.topic_id
  ),
  mistakes as (
    -- Open = answered wrong and not solved correctly afterwards (as in Revision).
    select lw.topic_id, count(*)::integer as n
    from last_wrong lw
    where not exists (
      select 1 from mine c
      where c.question_id = lw.question_id
        and c.status in ('independent', 'hint')
        and c.created_at > lw.at
    )
    group by lw.topic_id
  ),
  exam_activity as (
    select s.exam_id, count(*) as n
    from mine m
    join public.topics t   on t.id = m.topic_id
    join public.subjects s on s.id = t.subject_id
    group by s.exam_id
  ),
  topic_info as (
    select t.id, t.name, t.position as t_pos, s.name as s_name, s.position as s_pos,
           e.id as exam_id, e.slug, e.name as e_name,
           (select count(*) from pub p where p.topic_id = t.id)::integer as published
    from public.topics t
    join public.subjects s on s.id = t.subject_id
    join public.exams e    on e.id = s.exam_id
  ),
  scored as (
    select ti.*, ea.n as exam_n,
           an.answered, an.credit, tu.last_at, tu.tried,
           coalesce(mi.n, 0) as open_n,
           case when an.answered is null then null
                else ((an.credit + 1) / (an.answered + 2))::numeric end as m
    from topic_info ti
    join exam_activity ea on ea.exam_id = ti.exam_id
    left join answers an  on an.topic_id = ti.id
    left join touched tu  on tu.topic_id = ti.id
    left join mistakes mi on mi.topic_id = ti.id
    where ti.published > 0
  ),
  ranked as (
    select sc.*,
           case when sc.m is null then null
                else (v_today - (sc.last_at at time zone p_tz)::date) end as days,
           case when sc.m is null then null
                when sc.m < 0.5  then 1
                when sc.m < 0.7  then 3
                when sc.m < 0.85 then 7
                else 14 end as ivl
    from scored sc
  ),
  final as (
    select r.*,
           case when r.m is null then 0.2::numeric
                else (0.5 * (1 - r.m)
                      + 0.3 * least(r.days::numeric / r.ivl, 2) / 2
                      + 0.2 * least(r.open_n, 3)::numeric / 3) end as sc,
           case when r.m is null then 'new'
                when r.open_n > 0 then 'mistakes'
                when r.m < 0.6 then 'weak'
                when r.days >= r.ivl then 'due'
                else 'review' end as k
    from ranked r
  )
  select f.id, f.name, f.s_name, f.slug, f.e_name, f.k, f.m::real,
         coalesce(f.answered, 0), f.open_n, f.days, f.ivl,
         greatest(f.published - coalesce(f.tried, 0), 0),
         f.sc::real
  from final f
  order by f.sc desc, f.exam_n desc, f.s_pos, f.t_pos, f.name
  limit greatest(1, least(coalesce(p_limit, 3), 10));
end;
$$;

revoke execute on function public.recommend_topics(integer, text) from public, anonymous;
grant  execute on function public.recommend_topics(integer, text) to authenticated;

commit;

notify pgrst, 'reload schema';
