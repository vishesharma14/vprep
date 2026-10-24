-- =====================================================================
-- !!  DO NOT RUN. One-off pre-launch script, kept only as a record.  !!
--
-- This and cleanup_2_delete.sql were run once, before launch, to remove
-- test data. They must never be used again now that real content exists:
-- part 2 deletes every question above Q1054, and real questions start at
-- Q1056, so it would delete real questions, every problem report, and
-- every exam, subject, topic and formula added since seed.sql. This
-- preview changes nothing, but everything it lists is now real content.
-- =====================================================================
-- VPrep cleanup, part 1 of 2: PREVIEW (changes nothing)
--
-- Lists the test data that part 2 will delete: questions added after the
-- seed (code above Q1054), every problem report, and exams, subjects,
-- topics and formulas that are not in seed.sql. The last rows (kind
-- "learner") are information only: part 2 never deletes learners.
--
-- Run this, read the list, then run part 2. If something in the list is
-- real content you want to keep, don't run part 2.
-- =====================================================================

with seed_exams (exam_slug) as (values
    ('ssc-cgl'),
    ('nda'),
    ('jee-main'),
    ('gate-cse'),
    ('neet'),
    ('placement'),
    ('da-cert')
),
seed_subjects (exam_slug, subject_slug) as (values
    ('ssc-cgl', 'quantitative-aptitude'),
    ('ssc-cgl', 'general-intelligence-reasoning'),
    ('ssc-cgl', 'general-awareness'),
    ('nda', 'mathematics'),
    ('nda', 'general-ability-physics'),
    ('jee-main', 'physics'),
    ('jee-main', 'chemistry'),
    ('jee-main', 'mathematics'),
    ('gate-cse', 'databases'),
    ('gate-cse', 'operating-systems'),
    ('gate-cse', 'algorithms-data-structures'),
    ('neet', 'biology'),
    ('placement', 'quantitative-aptitude'),
    ('placement', 'logical-reasoning'),
    ('placement', 'technical-mcqs'),
    ('da-cert', 'statistics'),
    ('da-cert', 'sql-for-analysis')
),
seed_topics (exam_slug, subject_slug, topic_slug) as (values
    ('ssc-cgl', 'quantitative-aptitude', 'percentage'),
    ('ssc-cgl', 'quantitative-aptitude', 'profit-loss'),
    ('ssc-cgl', 'quantitative-aptitude', 'time-work'),
    ('ssc-cgl', 'quantitative-aptitude', 'simple-compound-interest'),
    ('ssc-cgl', 'general-intelligence-reasoning', 'coding-decoding'),
    ('ssc-cgl', 'general-intelligence-reasoning', 'number-series'),
    ('ssc-cgl', 'general-awareness', 'indian-polity'),
    ('nda', 'mathematics', 'trigonometry'),
    ('nda', 'mathematics', 'logarithms'),
    ('nda', 'general-ability-physics', 'units-measurement'),
    ('nda', 'general-ability-physics', 'motion'),
    ('jee-main', 'physics', 'kinematics'),
    ('jee-main', 'chemistry', 'mole-concept'),
    ('jee-main', 'mathematics', 'quadratic-equations'),
    ('jee-main', 'mathematics', 'calculus'),
    ('gate-cse', 'databases', 'normalization'),
    ('gate-cse', 'databases', 'sql'),
    ('gate-cse', 'operating-systems', 'cpu-scheduling'),
    ('gate-cse', 'operating-systems', 'memory-management'),
    ('gate-cse', 'algorithms-data-structures', 'complexity'),
    ('gate-cse', 'algorithms-data-structures', 'trees'),
    ('neet', 'biology', 'cell-biology'),
    ('neet', 'biology', 'genetics'),
    ('neet', 'biology', 'human-physiology'),
    ('placement', 'quantitative-aptitude', 'time-speed-distance'),
    ('placement', 'quantitative-aptitude', 'probability'),
    ('placement', 'logical-reasoning', 'blood-relations'),
    ('placement', 'logical-reasoning', 'direction-sense'),
    ('placement', 'technical-mcqs', 'oop-concepts'),
    ('placement', 'technical-mcqs', 'python-basics'),
    ('da-cert', 'statistics', 'descriptive-statistics'),
    ('da-cert', 'sql-for-analysis', 'joins')
),
seed_formulas (slug) as (values
    ('successive-percentage-change'),
    ('reverse-percentage-comparison'),
    ('profit-and-loss'),
    ('selling-price-after-discount'),
    ('two-people-working-together'),
    ('ci-si-over-2-years'),
    ('speed-unit-conversion'),
    ('average-speed-over-equal-distances'),
    ('straight-line-distance'),
    ('roots-of-ax-bx-c-0'),
    ('discriminant'),
    ('product-rule'),
    ('standard-trigonometric-limit'),
    ('second-derivative-test'),
    ('sum-of-sine-and-cosine'),
    ('standard-values'),
    ('number-of-digits-in-a'),
    ('equations-of-motion'),
    ('projectile-range-and-height'),
    ('mole-relations'),
    ('scheduling-times'),
    ('minimum-height-of-a-binary-tree'),
    ('master-theorem-case-2'),
    ('min-and-max-by-pairs'),
    ('classical-probability'),
    ('complement-rule'),
    ('z-score')
),
taxonomy as (
  select e.id as exam_id, e.slug as exam_slug, e.name as exam_name,
         s.id as subject_id, s.slug as subject_slug, s.name as subject_name,
         t.id as topic_id, t.slug as topic_slug, t.name as topic_name
  from public.exams e
  left join public.subjects s on s.exam_id = e.id
  left join public.topics t   on t.subject_id = s.id
)
select kind, item, detail
from (
  select 1 as ord, 'question' as kind, q.code as item,
         q.status || ' · ' || left(regexp_replace(q.body, '\s+', ' ', 'g'), 60) as detail
  from public.questions q
  where substring(q.code from 2)::int > 1054

  union all
  select 2, 'report', q.code,
         r.reason || ' · ' || r.status || coalesce(' · ' || left(r.note, 40), '')
  from public.reports r
  join public.questions q on q.id = r.question_id

  union all
  select distinct 3, 'exam', x.exam_name, x.exam_slug
  from taxonomy x
  where x.exam_slug not in (select exam_slug from seed_exams)

  union all
  select distinct 4, 'subject', x.subject_name, x.exam_slug || ' / ' || x.subject_slug
  from taxonomy x
  where x.subject_id is not null
    and x.exam_slug in (select exam_slug from seed_exams)
    and (x.exam_slug, x.subject_slug) not in (select exam_slug, subject_slug from seed_subjects)

  union all
  select distinct 5, 'topic', x.topic_name, x.exam_slug || ' / ' || x.subject_slug || ' / ' || x.topic_slug
  from taxonomy x
  where x.topic_id is not null
    and (x.exam_slug, x.subject_slug) in (select exam_slug, subject_slug from seed_subjects)
    and (x.exam_slug, x.subject_slug, x.topic_slug) not in (select exam_slug, subject_slug, topic_slug from seed_topics)

  union all
  select 6, 'formula', f.name, f.slug
  from public.formulas f
  where f.slug not in (select slug from seed_formulas)

  union all
  select 7, 'learner (kept)', u.email,
         p.full_name || ' · ' || p.role || case when p.is_suspended then ' · suspended' else '' end
           || ' · ' || (select count(*) from public.attempts a where a.user_id = p.id) || ' attempts'
  from public.profiles p
  join neon_auth."user" u on u.id = p.id
) rows
order by ord, item;
