-- =====================================================================
-- VPrep migration 0006: question search, formula catalog, leaderboard fix
--
-- 1. search_questions(): keyword search over published questions
--    (body, options, subtopic, tags, topic, subject, exam, year, source,
--    code). Every word must appear somewhere; partial words match
--    ("prob" finds "probability"). Optional filters: exam, difficulty, type.
-- 2. formula_catalog view: each formula with how many published questions
--    use it and their ids.
-- 3. get_leaderboard(): count only published questions, matching the
--    Progress page.
--
-- Run once in the SQL Editor. Adds/replaces read-only objects only.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Search
-- ---------------------------------------------------------------------
create or replace function public.search_questions(
  p_query      text    default null,
  p_exam       text    default null,
  p_difficulty text    default null,
  p_type       text    default null,
  p_limit      integer default 50
)
returns table (
  id           uuid,
  code         text,
  body         text,
  difficulty   text,
  type         text,
  year         integer,
  subtopic     text,
  tags         text[],
  topic_id     uuid,
  topic_name   text,
  subject_name text,
  exam_slug    text,
  exam_name    text,
  match_rank   integer
)
language sql
stable
set search_path = ''
as $$
  with params as (
    select lower(btrim(coalesce(p_query, ''))) as q,
           array_remove(regexp_split_to_array(lower(btrim(coalesce(p_query, ''))), '\s+'), '') as words
  ),
  docs as (
    select q.id, q.code, q.body, q.difficulty, q.type, q.year, q.subtopic, q.tags,
           t.id as topic_id, t.name as topic_name, s.name as subject_name,
           e.slug as exam_slug, e.name as exam_name,
           lower(concat_ws(' ', q.code, q.body, array_to_string(q.options, ' '), q.subtopic,
                 array_to_string(q.tags, ' '), t.name, s.name, e.name, e.full_name,
                 q.year::text, q.source)) as doc,
           lower(concat_ws(' ', q.subtopic, t.name, s.name, e.name)) as heading
    from public.questions q
    join public.topics t   on t.id = q.topic_id
    join public.subjects s on s.id = t.subject_id
    join public.exams e    on e.id = s.exam_id
    where q.status = 'published'
      and (p_exam is null or e.slug = p_exam)
      and (p_difficulty is null or q.difficulty = p_difficulty)
      and (p_type is null or q.type = p_type)
  )
  select d.id, d.code, d.body, d.difficulty, d.type, d.year, d.subtopic, d.tags,
         d.topic_id, d.topic_name, d.subject_name, d.exam_slug, d.exam_name,
         case
           when p.q <> '' and position(p.q in lower(d.body)) > 0 then 0  -- whole phrase in the question
           when p.q <> '' and position(p.q in d.heading) > 0 then 1      -- whole phrase in topic / exam
           else 2
         end as match_rank
  from docs d, params p
  -- Nothing to search for and no filter: return nothing rather than everything.
  where (cardinality(p.words) > 0 or p_exam is not null or p_difficulty is not null or p_type is not null)
    and not exists (select 1 from unnest(p.words) as w(word) where position(w.word in d.doc) = 0)
  order by match_rank, d.code
  limit greatest(1, least(coalesce(p_limit, 50), 200))
$$;

revoke execute on function public.search_questions(text, text, text, text, integer) from public;
grant  execute on function public.search_questions(text, text, text, text, integer) to anonymous, authenticated;

-- ---------------------------------------------------------------------
-- 2. Formula catalog
-- ---------------------------------------------------------------------
create view public.formula_catalog
with (security_invoker = true)
as
select f.id, f.slug, f.group_name, f.name, f.expression, f.note,
       (count(q.id) filter (where q.status = 'published'))::integer as question_count,
       coalesce(array_agg(q.id order by q.code) filter (where q.status = 'published'), '{}'::uuid[]) as question_ids
from public.formulas f
left join public.questions q on q.formula_id = f.id
group by f.id;

revoke all on public.formula_catalog from anonymous, authenticated;
grant select on public.formula_catalog to anonymous, authenticated;

-- ---------------------------------------------------------------------
-- 3. Leaderboard counts published questions only
-- ---------------------------------------------------------------------
create or replace function public.get_leaderboard(
  p_country text default null,
  p_state   text default null,
  p_limit   integer default 100
)
returns table (
  rank      bigint,
  user_id   uuid,
  full_name text,
  state     text,
  country   text,
  points    bigint
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
  )
  select
    rank() over (order by coalesce(t.points, 0) desc) as rank,
    p.id,
    p.full_name,
    p.state,
    p.country,
    coalesce(t.points, 0) as points
  from public.profiles p
  left join totals t on t.user_id = p.id
  where not p.is_suspended
    and (p_country is null or p.country = p_country)
    and (p_state is null or p.state = p_state)
  order by rank, p.full_name
  limit greatest(1, least(coalesce(p_limit, 100), 500))
$$;

commit;

notify pgrst, 'reload schema';
