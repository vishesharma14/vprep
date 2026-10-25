-- =====================================================================
-- VPrep migration 0012: data-driven question difficulty (Rasch / 1PL IRT)
--
-- 1. question_difficulty: one row per question, written by the offline
--    script ml/fit_difficulty.py. It fits P(correct) = σ(ability − difficulty)
--    to learners' first answers and stores, per question:
--      difficulty   logit: 0 means an average learner has a 50% chance,
--                   higher is harder
--      std_error    uncertainty of that estimate
--      responses    first answers used (per learner)
--      correct_rate share of those answers that were correct
--      p_average    predicted chance that an average learner gets it right
--      level        easy / medium / hard from p_average, or null when there
--                   are too few responses to say
--    Nobody reads the table directly; the admin function below does.
-- 2. admin_question_difficulty(): every question with the difficulty the
--    admin set next to what the data says.
--
-- Run once in the SQL Editor, then Data API -> Refresh schema cache.
-- =====================================================================

begin;

create table public.question_difficulty (
  question_id  uuid primary key references public.questions (id) on delete cascade,
  model        text not null,
  difficulty   real not null,
  std_error    real not null check (std_error >= 0),
  responses    integer not null check (responses >= 0),
  correct_rate real not null check (correct_rate between 0 and 1),
  p_average    real not null check (p_average between 0 and 1),
  level        text check (level in ('easy', 'medium', 'hard')),
  fitted_at    timestamptz not null default now()
);

alter table public.question_difficulty enable row level security;
-- No policies on purpose: only the database owner (the fitting script) and
-- the SECURITY DEFINER function below touch this table.
revoke all on public.question_difficulty from public, anonymous, authenticated;

create or replace function public.admin_question_difficulty()
returns table (
  question_id     uuid,
  code            text,
  body            text,
  status          text,
  topic_name      text,
  exam_name       text,
  set_level       text,
  estimated_level text,
  difficulty      real,
  std_error       real,
  responses       integer,
  correct_rate    real,
  p_average       real,
  fitted_at       timestamptz
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
  select q.id, q.code, q.body, q.status, t.name, ex.name,
         q.difficulty, d.level, d.difficulty, d.std_error, d.responses,
         d.correct_rate, d.p_average, d.fitted_at
  from public.questions q
  join public.topics t    on t.id = q.topic_id
  join public.subjects s  on s.id = t.subject_id
  join public.exams ex    on ex.id = s.exam_id
  left join public.question_difficulty d on d.question_id = q.id
  order by q.code;
end;
$$;

revoke execute on function public.admin_question_difficulty() from public, anonymous;
grant  execute on function public.admin_question_difficulty() to authenticated;

commit;

notify pgrst, 'reload schema';
