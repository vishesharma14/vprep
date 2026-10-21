-- =====================================================================
-- VPrep migration 0002: catalog and progress views for the Exams pages
--
-- Run once, after 0001_schema.sql and seed.sql:
-- SQL Editor -> paste -> Run. Runs in one transaction.
-- Adds two read-only views; changes no existing table or data.
-- =====================================================================

begin;

-- Question counts per topic, for everyone (signed in or not).
-- Counts only published questions, so admins see the same numbers as learners.
create view public.topic_catalog
with (security_invoker = true)
as
select
  t.id         as topic_id,
  t.subject_id,
  (count(q.id) filter (where q.status = 'published'))::int                            as question_count,
  (count(q.id) filter (where q.status = 'published' and q.difficulty = 'easy'))::int   as easy_count,
  (count(q.id) filter (where q.status = 'published' and q.difficulty = 'medium'))::int as medium_count,
  (count(q.id) filter (where q.status = 'published' and q.difficulty = 'hard'))::int   as hard_count,
  (count(q.id) filter (where q.status = 'published' and q.type = 'pyq'))::int          as pyq_count,
  coalesce(
    array_agg(distinct q.subtopic order by q.subtopic)
      filter (where q.status = 'published' and q.subtopic is not null),
    '{}'::text[]
  ) as subtopics
from public.topics t
left join public.questions q on q.topic_id = t.id
group by t.id, t.subject_id;

-- The signed-in learner's own progress per topic. Always filtered to the
-- current user, so admins (who can read all attempts) still see only their own.
--   attempted = distinct questions tried
--   answered  = attempts that were graded (correct or incorrect)
--   correct   = solved independently or after a hint
-- Accuracy in the app = correct / answered.
create view public.my_topic_progress
with (security_invoker = true)
as
select
  q.topic_id,
  (count(distinct a.question_id))::int                                         as attempted,
  (count(*) filter (where a.status in ('independent', 'hint', 'incorrect')))::int as answered,
  (count(*) filter (where a.status in ('independent', 'hint')))::int             as correct,
  (count(*) filter (where a.status = 'independent'))::int                       as independent,
  max(a.created_at)                                                            as last_attempt_at
from public.attempts a
join public.questions q on q.id = a.question_id
where a.user_id = (select public.current_user_id())
group by q.topic_id;

revoke all on public.topic_catalog, public.my_topic_progress from anonymous, authenticated;
grant select on public.topic_catalog     to anonymous, authenticated;
grant select on public.my_topic_progress to authenticated;

commit;

-- Tell the Data API about the new views (same as "Refresh schema cache").
notify pgrst, 'reload schema';
