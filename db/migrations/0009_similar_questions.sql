-- =====================================================================
-- VPrep migration 0009: similar questions with embeddings (pgvector)
--
-- 1. question_embeddings: one 384-dimensional vector per question, written
--    by the offline script in ml/ (sentence-transformers). Nobody reads the
--    table directly; the functions below do.
-- 2. similar_questions(): the nearest published questions by cosine
--    similarity, for "Try similar questions" after a wrong answer. For a
--    signed-in learner it skips questions they have already solved, and it
--    drops weak matches (below p_min_similarity) rather than padding the list.
-- 3. admin_similar_questions(): the same over every status, so admins can
--    spot near-duplicates.
-- 4. admin_embedding_status(): how many questions still need an embedding.
--
-- Run once in the SQL Editor.
-- =====================================================================

begin;

create extension if not exists vector with schema public;

-- ---------------------------------------------------------------------
-- 1. Embeddings
-- ---------------------------------------------------------------------
create table public.question_embeddings (
  question_id  uuid primary key references public.questions (id) on delete cascade,
  model        text not null,
  content_hash text not null,
  embedding    public.vector(384) not null,
  updated_at   timestamptz not null default now()
);

create index question_embeddings_hnsw_idx
  on public.question_embeddings using hnsw (embedding public.vector_cosine_ops);

alter table public.question_embeddings enable row level security;
-- No policies on purpose: only the database owner (the embedding script) and
-- the SECURITY DEFINER functions below touch this table.
revoke all on public.question_embeddings from public, anonymous, authenticated;

-- ---------------------------------------------------------------------
-- 2. Similar questions for learners
-- ---------------------------------------------------------------------
create or replace function public.similar_questions(
  p_question_id    uuid,
  p_limit          integer default 3,
  p_same_exam      boolean default true,
  p_min_similarity real    default 0.3
)
returns table (
  id           uuid,
  code         text,
  body         text,
  difficulty   text,
  topic_id     uuid,
  topic_name   text,
  exam_slug    text,
  exam_name    text,
  similarity   real
)
language sql
stable
security definer
set search_path = ''
as $$
  with src as (
    select e.embedding, s.exam_id
    from public.question_embeddings e
    join public.questions q on q.id = e.question_id and q.status = 'published'
    join public.topics t    on t.id = q.topic_id
    join public.subjects s  on s.id = t.subject_id
    where e.question_id = p_question_id
  ),
  me as (
    select public.current_user_id() as id
  )
  select q.id, q.code, q.body, q.difficulty, t.id, t.name, ex.slug, ex.name,
         (1 - (e.embedding operator(public.<=>) src.embedding))::real
  from src
  cross join me
  join public.question_embeddings e on e.question_id <> p_question_id
  join public.questions q on q.id = e.question_id and q.status = 'published'
  join public.topics t    on t.id = q.topic_id
  join public.subjects s  on s.id = t.subject_id
  join public.exams ex    on ex.id = s.exam_id
  where (not coalesce(p_same_exam, true) or ex.id = src.exam_id)
    and 1 - (e.embedding operator(public.<=>) src.embedding) >= coalesce(p_min_similarity, 0.3)
    and not exists (
      select 1 from public.attempts a
      where a.user_id = me.id
        and a.question_id = q.id
        and a.status in ('independent', 'hint')
    )
  order by e.embedding operator(public.<=>) src.embedding, q.code
  limit greatest(1, least(coalesce(p_limit, 3), 10))
$$;

revoke execute on function public.similar_questions(uuid, integer, boolean, real) from public;
grant  execute on function public.similar_questions(uuid, integer, boolean, real) to anonymous, authenticated;

-- ---------------------------------------------------------------------
-- 3. Near-duplicates for admins (every status, every exam)
-- ---------------------------------------------------------------------
create or replace function public.admin_similar_questions(
  p_question_id uuid,
  p_limit       integer default 5
)
returns table (
  id          uuid,
  code        text,
  body        text,
  status      text,
  topic_name  text,
  exam_name   text,
  similarity  real
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
         (1 - (e.embedding operator(public.<=>) src.embedding))::real
  from public.question_embeddings src
  join public.question_embeddings e on e.question_id <> src.question_id
  join public.questions q on q.id = e.question_id
  join public.topics t    on t.id = q.topic_id
  join public.subjects s  on s.id = t.subject_id
  join public.exams ex    on ex.id = s.exam_id
  where src.question_id = p_question_id
  order by e.embedding operator(public.<=>) src.embedding, q.code
  limit greatest(1, least(coalesce(p_limit, 5), 20));
end;
$$;

revoke execute on function public.admin_similar_questions(uuid, integer) from public, anonymous;
grant  execute on function public.admin_similar_questions(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Coverage for admins
-- ---------------------------------------------------------------------
create or replace function public.admin_embedding_status()
returns table (
  questions bigint,
  embedded  bigint,
  missing   bigint,
  stale     bigint,
  model     text
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
  select count(q.id),
         count(e.question_id),
         count(q.id) filter (where e.question_id is null),
         count(q.id) filter (where e.updated_at < q.updated_at),
         (select string_agg(distinct x.model, ', ') from public.question_embeddings x)
  from public.questions q
  left join public.question_embeddings e on e.question_id = q.id;
end;
$$;

revoke execute on function public.admin_embedding_status() from public, anonymous;
grant  execute on function public.admin_embedding_status() to authenticated;

commit;

notify pgrst, 'reload schema';
