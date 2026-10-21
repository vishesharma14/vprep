-- =====================================================================
-- VPrep database schema, v1 (Neon: Postgres + Neon Auth + Data API)
--
-- Before running: in the Neon Console, enable Auth and then the Data API
-- (with "Use Neon Auth" checked). This script checks for both.
--
-- Run once: SQL Editor -> paste -> Run. Everything runs in one
-- transaction, so if any line fails nothing is created and you can run
-- it again after fixing the problem.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Pre-flight check
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('neon_auth."user"') is null then
    raise exception 'Neon Auth is not enabled. In the Neon Console open Auth, click Enable Auth, then run this script again.';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_roles where rolname = 'anonymous') then
    raise exception 'The Data API is not enabled. In the Neon Console open Data API, tick "Use Neon Auth", click Enable Data API, then run this script again.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------
-- The signed-in user's id as a uuid, or null for guests, anonymous tokens
-- and the SQL Editor. Wraps Neon's auth.user_id(), which returns text.
create or replace function public.current_user_id()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_sub text;
begin
  begin
    v_sub := auth.user_id();
  exception when others then
    return null;
  end;
  if v_sub ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_sub::uuid;
  end if;
  return null;
end;
$$;

-- Points per attempt status (used by the leaderboard)
create or replace function public.attempt_points(p_status text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'independent' then 10
    when 'hint'        then 6
    when 'revealed'    then 1
    else 0
  end
$$;

-- ---------------------------------------------------------------------
-- 2. Profiles: one row per learner, linked to the Neon Auth user
-- ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references neon_auth."user" (id) on delete cascade,
  full_name    text not null check (char_length(full_name) between 1 and 80),
  state        text,
  country      text not null default 'India',
  role         text not null default 'learner' check (role in ('learner', 'admin')),
  daily_goal   integer not null default 15 check (daily_goal between 1 and 200),
  is_suspended boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Is the signed-in user an active admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = public.current_user_id() and role = 'admin' and not is_suspended
  )
$$;

-- Is the signed-in user allowed to write (has a profile and is not suspended)?
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = public.current_user_id() and not is_suspended
  )
$$;

-- ---------------------------------------------------------------------
-- 3. Content: exams -> subjects -> topics, formulas, questions
-- ---------------------------------------------------------------------
create table public.exams (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name       text not null check (char_length(name) between 1 and 60),
  full_name  text,
  category   text not null check (category in ('government', 'engineering', 'medical', 'placement', 'certification')),
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.subjects (
  id       uuid primary key default gen_random_uuid(),
  exam_id  uuid not null references public.exams (id) on delete cascade,
  slug     text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name     text not null check (char_length(name) between 1 and 80),
  position integer not null default 0,
  unique (exam_id, slug)
);
create index subjects_exam_idx on public.subjects (exam_id);

create table public.topics (
  id         uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete cascade,
  slug       text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name       text not null check (char_length(name) between 1 and 80),
  position   integer not null default 0,
  unique (subject_id, slug)
);
create index topics_subject_idx on public.topics (subject_id);

create table public.formulas (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  group_name text not null,
  name       text not null,
  expression text not null,
  note       text,
  created_at timestamptz not null default now()
);

-- Human-friendly question IDs: Q1001, Q1002, ...
create sequence public.question_code_seq start 1001;

create table public.questions (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique default ('Q' || nextval('public.question_code_seq')),
  -- "restrict": a topic that still has questions cannot be deleted by accident
  topic_id     uuid not null references public.topics (id) on delete restrict,
  subtopic     text,
  difficulty   text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  type         text not null default 'practice' check (type in ('practice', 'pyq')),
  year         integer check (year between 1950 and 2100),
  source       text,
  body         text not null check (char_length(btrim(body)) > 0),
  options      text[] not null check (cardinality(options) between 2 and 6),
  answer_index integer not null check (answer_index >= 0),
  hint         text,
  explanation  text,
  formula_id   uuid references public.formulas (id) on delete set null,
  tags         text[] not null default '{}',
  status       text not null default 'draft' check (status in ('draft', 'in_review', 'published')),
  created_by   uuid default public.current_user_id() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint options_not_blank check (array_position(options, null) is null and array_position(options, '') is null),
  constraint answer_in_range check (answer_index < cardinality(options)),
  constraint pyq_needs_year check (type <> 'pyq' or year is not null),
  constraint published_needs_explanation check (status <> 'published' or coalesce(btrim(explanation), '') <> '')
);
alter sequence public.question_code_seq owned by public.questions.code;
create index questions_topic_idx on public.questions (topic_id);
create index questions_status_idx on public.questions (status);
create index questions_formula_idx on public.questions (formula_id);
create index questions_created_by_idx on public.questions (created_by);

-- ---------------------------------------------------------------------
-- 4. Learner activity: attempts, bookmarks, reports
-- ---------------------------------------------------------------------
-- Every attempt is permanent: no updates or deletes from the app.
create table public.attempts (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default public.current_user_id() references public.profiles (id) on delete cascade,
  question_id    uuid not null references public.questions (id) on delete cascade,
  mode           text not null check (mode in ('practice', 'timed')),
  status         text not null check (status in ('independent', 'hint', 'revealed', 'incorrect', 'skipped')),
  selected_index integer check (selected_index >= 0),
  time_spent_ms  integer not null default 0 check (time_spent_ms between 0 and 86400000),
  created_at     timestamptz not null default now(),
  constraint skipped_has_no_answer check (status <> 'skipped' or selected_index is null)
);
create index attempts_user_created_idx on public.attempts (user_id, created_at desc);
create index attempts_question_idx on public.attempts (question_id);

create table public.bookmark_lists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default public.current_user_id() references public.profiles (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.bookmarks (
  user_id     uuid not null default public.current_user_id() references public.profiles (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  list_id     uuid not null references public.bookmark_lists (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index bookmarks_list_idx on public.bookmarks (list_id);
create index bookmarks_question_idx on public.bookmarks (question_id);

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  user_id     uuid default public.current_user_id() references public.profiles (id) on delete set null,
  reason      text not null check (reason in ('wrong_answer', 'explanation_unclear', 'question_unclear', 'typo', 'other')),
  note        text check (char_length(note) <= 1000),
  status      text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);
create index reports_status_idx on public.reports (status, created_at desc);
create index reports_question_idx on public.reports (question_id);
create index reports_user_idx on public.reports (user_id);
create index reports_resolved_by_idx on public.reports (resolved_by);

-- ---------------------------------------------------------------------
-- 5. Profile creation (the app calls this right after sign-up / sign-in)
-- ---------------------------------------------------------------------
-- Creates the learner's profile and default "Revision" bookmark list the
-- first time, and returns the profile every time. The name comes from
-- Neon Auth; the state is optional.
create or replace function public.ensure_profile(p_state text default null)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := public.current_user_id();
  v_name text;
  v_row  public.profiles;
begin
  if v_uid is null then
    raise exception 'Sign in before creating a profile';
  end if;

  select * into v_row from public.profiles where id = v_uid;
  if found then
    return v_row;
  end if;

  select left(coalesce(nullif(btrim(u.name), ''), split_part(u.email, '@', 1), 'Learner'), 80)
    into v_name
  from neon_auth."user" u
  where u.id = v_uid;
  if v_name is null then
    raise exception 'No Neon Auth user found for this session';
  end if;

  insert into public.profiles (id, full_name, state)
  values (v_uid, v_name, nullif(btrim(p_state), ''))
  on conflict (id) do nothing;

  insert into public.bookmark_lists (user_id, name)
  values (v_uid, 'Revision')
  on conflict (user_id, name) do nothing;

  select * into v_row from public.profiles where id = v_uid;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Triggers
-- ---------------------------------------------------------------------
-- Learners can edit their own name, state and goal, but not their role
-- or suspension. (The SQL Editor runs as the database owner, so it can.)
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anonymous', 'authenticated')
     and not public.is_admin()
     and (new.role is distinct from old.role
          or new.is_suspended is distinct from old.is_suspended
          or new.created_at is distinct from old.created_at) then
    raise exception 'Only an admin can change role or suspension status';
  end if;
  if new.id is distinct from old.id then
    raise exception 'A profile id cannot change';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Keep questions.updated_at current.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger questions_touch_updated_at
  before update on public.questions
  for each row execute function public.touch_updated_at();

-- Honest progress: the database checks that an attempt's status matches the
-- option chosen, only allows attempts on published questions, and stamps the
-- time itself so streaks can't be back-dated.
create or replace function public.validate_attempt()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_answer  integer;
  v_options integer;
  v_status  text;
begin
  select q.answer_index, cardinality(q.options), q.status
    into v_answer, v_options, v_status
  from public.questions q
  where q.id = new.question_id;

  if v_status is distinct from 'published' then
    raise exception 'Attempts are only allowed on published questions';
  end if;
  if new.selected_index is not null and new.selected_index >= v_options then
    raise exception 'Selected option is out of range';
  end if;
  if new.status in ('independent', 'hint') and new.selected_index is distinct from v_answer then
    raise exception 'A correct status needs the correct option';
  end if;
  if new.status = 'incorrect' and (new.selected_index is null or new.selected_index = v_answer) then
    raise exception 'An incorrect status needs a wrong option';
  end if;

  new.created_at := now();
  return new;
end;
$$;

create trigger attempts_validate
  before insert on public.attempts
  for each row execute function public.validate_attempt();

-- ---------------------------------------------------------------------
-- 7. Views and functions the app reads from
-- ---------------------------------------------------------------------
-- Mistakes notebook, derived from attempts so it never gets out of sync.
-- A mistake is cleared when the question is answered correctly after the
-- latest wrong answer. Runs with the caller's permissions, so each learner
-- only sees their own rows.
create view public.my_mistakes
with (security_invoker = true)
as
with last_wrong as (
  select a.user_id, a.question_id, max(a.created_at) as last_missed_at
  from public.attempts a
  where a.status = 'incorrect'
  group by a.user_id, a.question_id
)
select
  lw.user_id,
  lw.question_id,
  lw.last_missed_at,
  (
    select min(a.created_at)
    from public.attempts a
    where a.user_id = lw.user_id
      and a.question_id = lw.question_id
      and a.status in ('independent', 'hint')
      and a.created_at > lw.last_missed_at
  ) as cleared_at
from last_wrong lw;

-- Leaderboard: best attempt per question, summed. Exposes only name, state,
-- country and points, never individual attempts.
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

-- ---------------------------------------------------------------------
-- 8. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.exams          enable row level security;
alter table public.subjects       enable row level security;
alter table public.topics         enable row level security;
alter table public.formulas       enable row level security;
alter table public.questions      enable row level security;
alter table public.attempts       enable row level security;
alter table public.bookmark_lists enable row level security;
alter table public.bookmarks      enable row level security;
alter table public.reports        enable row level security;

-- profiles (rows are created only through ensure_profile)
create policy "profiles: read own, admins read all" on public.profiles
  for select to authenticated
  using (id = (select public.current_user_id()) or (select public.is_admin()));
create policy "profiles: update own, admins update all" on public.profiles
  for update to authenticated
  using (id = (select public.current_user_id()) or (select public.is_admin()))
  with check (id = (select public.current_user_id()) or (select public.is_admin()));

-- exams, subjects, topics, formulas: everyone reads, admins write
create policy "exams: anyone reads" on public.exams for select to anonymous, authenticated using (true);
create policy "exams: admins insert" on public.exams for insert to authenticated with check ((select public.is_admin()));
create policy "exams: admins update" on public.exams for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "exams: admins delete" on public.exams for delete to authenticated using ((select public.is_admin()));

create policy "subjects: anyone reads" on public.subjects for select to anonymous, authenticated using (true);
create policy "subjects: admins insert" on public.subjects for insert to authenticated with check ((select public.is_admin()));
create policy "subjects: admins update" on public.subjects for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "subjects: admins delete" on public.subjects for delete to authenticated using ((select public.is_admin()));

create policy "topics: anyone reads" on public.topics for select to anonymous, authenticated using (true);
create policy "topics: admins insert" on public.topics for insert to authenticated with check ((select public.is_admin()));
create policy "topics: admins update" on public.topics for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "topics: admins delete" on public.topics for delete to authenticated using ((select public.is_admin()));

create policy "formulas: anyone reads" on public.formulas for select to anonymous, authenticated using (true);
create policy "formulas: admins insert" on public.formulas for insert to authenticated with check ((select public.is_admin()));
create policy "formulas: admins update" on public.formulas for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "formulas: admins delete" on public.formulas for delete to authenticated using ((select public.is_admin()));

-- questions: learners see published ones only; admins see and manage all
create policy "questions: read published, admins read all" on public.questions
  for select to anonymous, authenticated
  using (status = 'published' or (select public.is_admin()));
create policy "questions: admins insert" on public.questions for insert to authenticated with check ((select public.is_admin()));
create policy "questions: admins update" on public.questions for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "questions: admins delete" on public.questions for delete to authenticated using ((select public.is_admin()));

-- attempts: own rows only, insert-only
create policy "attempts: read own, admins read all" on public.attempts
  for select to authenticated
  using (user_id = (select public.current_user_id()) or (select public.is_admin()));
create policy "attempts: active users insert their own" on public.attempts
  for insert to authenticated
  with check (user_id = (select public.current_user_id()) and (select public.is_active_user()));

-- bookmark lists and bookmarks: fully private to each learner
create policy "bookmark_lists: own rows" on public.bookmark_lists
  for all to authenticated
  using (user_id = (select public.current_user_id()))
  with check (user_id = (select public.current_user_id()));
create policy "bookmarks: own rows in own lists" on public.bookmarks
  for all to authenticated
  using (user_id = (select public.current_user_id()))
  with check (
    user_id = (select public.current_user_id())
    and exists (
      select 1 from public.bookmark_lists l
      where l.id = list_id and l.user_id = (select public.current_user_id())
    )
  );

-- reports: learners file and read their own; admins review all
create policy "reports: read own, admins read all" on public.reports
  for select to authenticated
  using (user_id = (select public.current_user_id()) or (select public.is_admin()));
create policy "reports: active users file their own" on public.reports
  for insert to authenticated
  with check (user_id = (select public.current_user_id()) and status = 'open' and (select public.is_active_user()));
create policy "reports: admins update" on public.reports
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "reports: admins delete" on public.reports
  for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- 9. Table privileges (a second lock behind RLS)
-- ---------------------------------------------------------------------
grant usage on schema public to anonymous, authenticated;

revoke all on public.profiles, public.exams, public.subjects, public.topics, public.formulas,
              public.questions, public.attempts, public.bookmark_lists, public.bookmarks,
              public.reports, public.my_mistakes
  from anonymous, authenticated;

grant select on public.exams, public.subjects, public.topics, public.formulas, public.questions
  to anonymous, authenticated;
grant insert, update, delete on public.exams, public.subjects, public.topics, public.formulas, public.questions
  to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert on public.attempts to authenticated;
grant select, insert, update, delete on public.bookmark_lists, public.bookmarks, public.reports to authenticated;
grant select on public.my_mistakes to authenticated;
grant usage on sequence public.question_code_seq to authenticated;

-- Trigger functions are never called directly.
revoke execute on function public.protect_profile_columns() from public, anonymous, authenticated;
revoke execute on function public.touch_updated_at()        from public, anonymous, authenticated;
revoke execute on function public.validate_attempt()        from public, anonymous, authenticated;

-- Only signed-in users can create a profile.
revoke execute on function public.ensure_profile(text) from public, anonymous;
grant  execute on function public.ensure_profile(text) to authenticated;

grant execute on function public.get_leaderboard(text, text, integer) to anonymous, authenticated;
grant execute on function public.current_user_id()                    to anonymous, authenticated;
grant execute on function public.is_admin()                           to anonymous, authenticated;
grant execute on function public.is_active_user()                     to anonymous, authenticated;
grant execute on function public.attempt_points(text)                 to anonymous, authenticated;

commit;

-- Tell the Data API to pick up the new tables (same as "Refresh schema cache").
notify pgrst, 'reload schema';
