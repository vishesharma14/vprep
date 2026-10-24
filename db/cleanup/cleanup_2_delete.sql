-- =====================================================================
-- !!  DO NOT RUN. One-off pre-launch script, kept only as a record.  !!
--
-- This and cleanup_1_preview.sql were run once, before launch, to remove
-- test data. They must never be used again now that real content exists:
-- this script deletes every question above Q1054, and real questions
-- start at Q1056, so it would delete real questions, every problem
-- report, and every exam, subject, topic and formula added since
-- seed.sql. (Migration 0007 makes it fail and roll back if a learner has
-- attempted one of those questions, but don't rely on that.)
-- =====================================================================
-- VPrep cleanup, part 2 of 2: DELETE test data
--
-- Run part 1 first and check its list. This deletes exactly what part 1
-- listed (except learners): questions above Q1054, all problem reports,
-- and exams, subjects, topics and formulas that are not in seed.sql.
-- Seed content that was renamed or moved is kept, because it is matched by
-- slug and slugs don't change on rename.
--
-- Everything runs in one transaction: if any step fails (for example a
-- test question that learners have attempted), nothing is deleted.
-- The last query should show 7 / 17 / 32 / 27 / 54 / 0.
-- =====================================================================

begin;

delete from public.reports;

delete from public.questions
where substring(code from 2)::int > 1054;

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
),
extra_topics as (
  select x.topic_id from taxonomy x
  where x.topic_id is not null
    and (x.exam_slug, x.subject_slug, x.topic_slug) not in (select exam_slug, subject_slug, topic_slug from seed_topics)
),
extra_subjects as (
  select distinct x.subject_id from taxonomy x
  where x.subject_id is not null
    and (x.exam_slug, x.subject_slug) not in (select exam_slug, subject_slug from seed_subjects)
),
extra_exams as (
  select distinct x.exam_id from taxonomy x
  where x.exam_slug not in (select exam_slug from seed_exams)
),
del_topics as (
  delete from public.topics where id in (select topic_id from extra_topics) returning 1
),
del_subjects as (
  delete from public.subjects where id in (select subject_id from extra_subjects) returning 1
),
del_exams as (
  delete from public.exams where id in (select exam_id from extra_exams) returning 1
),
del_formulas as (
  delete from public.formulas where slug not in (select slug from seed_formulas) returning 1
)
select (select count(*) from del_topics)   as topics_deleted,
       (select count(*) from del_subjects) as subjects_deleted,
       (select count(*) from del_exams)    as exams_deleted,
       (select count(*) from del_formulas) as formulas_deleted;

commit;

select (select count(*) from public.exams)     as exams,
       (select count(*) from public.subjects)  as subjects,
       (select count(*) from public.topics)    as topics,
       (select count(*) from public.formulas)  as formulas,
       (select count(*) from public.questions) as questions,
       (select count(*) from public.reports)   as reports;
