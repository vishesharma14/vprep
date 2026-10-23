// Domain types, mirroring db/migrations/0001_schema.sql. Field names are
// snake_case to match the Postgres columns, so Data API results can be typed
// without mapping. Timestamps are ISO strings and uuids are strings, as
// returned by the Data API. Nullable columns are `T | null`.

// ---------------------------------------------------------------------
// CHECK constraint values
// ---------------------------------------------------------------------

export type Role = 'learner' | 'admin'

export type ExamCategory = 'government' | 'engineering' | 'medical' | 'placement' | 'certification'

export type Difficulty = 'easy' | 'medium' | 'hard'

/** `pyq` = previous year question; these always have a `year`. */
export type QuestionType = 'practice' | 'pyq'

/** Learners only ever see `published` questions. */
export type QuestionStatus = 'draft' | 'in_review' | 'published'

export type AttemptMode = 'practice' | 'timed'

/** How a question attempt ended. */
export type AttemptStatus =
  | 'independent' // correct, with no help
  | 'hint' // correct after opening the hint
  | 'revealed' // answer revealed before answering
  | 'incorrect'
  | 'skipped'

export type ReportReason =
  | 'wrong_answer'
  | 'explanation_unclear'
  | 'question_unclear'
  | 'typo'
  | 'other'

export type ReportStatus = 'open' | 'resolved' | 'dismissed'

/** Leaderboard points per attempt status. Matches attempt_points() in the SQL. */
export const ATTEMPT_POINTS: Readonly<Record<AttemptStatus, number>> = {
  independent: 10,
  hint: 6,
  revealed: 1,
  incorrect: 0,
  skipped: 0,
}

// ---------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------

/** One row per learner. `id` is the Neon Auth user id. */
export interface Profile {
  id: string
  full_name: string
  state: string | null
  country: string
  role: Role
  /** Questions per day, 1–200. */
  daily_goal: number
  is_suspended: boolean
  created_at: string
}

export interface Exam {
  id: string
  slug: string
  /** Short name, e.g. "SSC CGL". */
  name: string
  /** Long name, e.g. "Staff Selection Commission, Combined Graduate Level". */
  full_name: string | null
  category: ExamCategory
  /** Sort order. */
  position: number
  created_at: string
}

export interface Subject {
  id: string
  exam_id: string
  slug: string
  name: string
  /** Sort order within the exam. */
  position: number
}

export interface Topic {
  id: string
  subject_id: string
  slug: string
  name: string
  /** Sort order within the subject. */
  position: number
}

export interface Formula {
  id: string
  slug: string
  group_name: string
  name: string
  expression: string
  note: string | null
  created_at: string
}

export interface Question {
  id: string
  /** Human-friendly id: Q1001, Q1002, … */
  code: string
  topic_id: string
  subtopic: string | null
  difficulty: Difficulty
  type: QuestionType
  /** Required when `type` is `pyq`. */
  year: number | null
  source: string | null
  body: string
  /** 2–6 option texts, shown as bubbles A, B, C, D… */
  options: string[]
  /** Index into `options` of the correct answer. */
  answer_index: number
  hint: string | null
  /** Required when `status` is `published`. */
  explanation: string | null
  formula_id: string | null
  tags: string[]
  status: QuestionStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Permanent: attempts are never updated or deleted. */
export interface Attempt {
  /** bigint identity, returned by the Data API as a number. */
  id: number
  user_id: string
  question_id: string
  mode: AttemptMode
  status: AttemptStatus
  /** Index into the question's `options`; always null when skipped. */
  selected_index: number | null
  time_spent_ms: number
  /** Set by the database on insert. */
  created_at: string
}

export interface BookmarkList {
  id: string
  user_id: string
  name: string
  created_at: string
}

/** A learner bookmarks a question at most once, in one list. */
export interface Bookmark {
  user_id: string
  question_id: string
  list_id: string
  created_at: string
}

export interface Report {
  id: string
  question_id: string
  /** Null if the reporter's profile was deleted. */
  user_id: string | null
  reason: ReportReason
  note: string | null
  status: ReportStatus
  created_at: string
  resolved_at: string | null
  resolved_by: string | null
}

// ---------------------------------------------------------------------
// Views and functions
// ---------------------------------------------------------------------

/** A row of the my_mistakes view: the signed-in learner's wrong answers. */
export interface MistakeRow {
  user_id: string
  question_id: string
  last_missed_at: string
  /** First correct answer after the last miss; null while still a mistake. */
  cleared_at: string | null
}

/** A row of the topic_catalog view. Counts published questions only. */
export interface TopicCatalogRow {
  topic_id: string
  subject_id: string
  question_count: number
  easy_count: number
  medium_count: number
  hard_count: number
  /** Previous year questions. */
  pyq_count: number
  /** Distinct subtopics of the published questions, sorted; empty if none. */
  subtopics: string[]
}

/** A row of the my_topic_progress view: the signed-in learner's own progress in one topic. */
export interface TopicProgressRow {
  topic_id: string
  /** Distinct questions tried. */
  attempted: number
  /** Graded attempts (correct or incorrect). Accuracy = correct / answered. */
  answered: number
  /** Attempts solved independently or after a hint. */
  correct: number
  /** Attempts solved with no help. */
  independent: number
  last_attempt_at: string
}

/** Attempt counts in my_progress(). bigints, returned as numbers. */
export interface MyProgressTotals {
  attempts: number
  /** Distinct questions tried. */
  unique_questions: number
  independent: number
  hint: number
  revealed: number
  incorrect: number
  skipped: number
  /** Time spent on every attempt, in ms. */
  time_ms: number
}

/** One day in my_progress().daily. */
export interface MyProgressDay {
  /** yyyy-mm-dd in the learner's time zone. */
  day: string
  attempts: number
  /** Attempts solved independently or after a hint. */
  correct: number
}

/** One subject in my_progress().subjects. */
export interface MyProgressSubject {
  subject_id: string
  subject_name: string
  exam_slug: string
  exam_name: string
  /** Distinct questions tried. */
  attempted: number
  /** Graded attempts (correct or incorrect). Accuracy = correct / answered. */
  answered: number
  correct: number
}

/** One topic in my_progress().topics. */
export interface MyProgressTopic extends MyProgressSubject {
  topic_id: string
  topic_name: string
  /** Questions missed and not solved correctly since the last miss. */
  open_mistakes: number
}

/**
 * What my_progress() returns: the signed-in learner's own attempts on
 * published questions, with days counted in `time_zone`.
 */
export interface MyProgress {
  /** The time zone used: the one asked for, or Asia/Kolkata if Postgres doesn't know it. */
  time_zone: string
  /** yyyy-mm-dd. */
  today: string
  /** Null only if the learner has no profile. */
  daily_goal: number | null
  /** Attempts today, of any status. */
  today_count: number
  /** yyyy-mm-dd of the latest attempt; null before the first. */
  last_active_day: string | null
  totals: MyProgressTotals
  /** Days in a row with at least one attempt. `current` is 0 unless that run reaches today or yesterday. */
  streak: { current: number; best: number }
  /** One per day, oldest first, ending today. */
  daily: MyProgressDay[]
  /** Subjects and topics with at least one attempt, by exam then name. */
  subjects: MyProgressSubject[]
  topics: MyProgressTopic[]
}

/**
 * A row returned by search_questions(): a published question with its place
 * in the catalog. Rows come best match first, then by code.
 */
export interface SearchQuestionRow
  extends Pick<Question, 'id' | 'code' | 'body' | 'difficulty' | 'type' | 'year' | 'subtopic' | 'tags' | 'topic_id'> {
  topic_name: string
  subject_name: string
  exam_slug: string
  exam_name: string
  /** 0: the whole query is in the body; 1: in the subtopic, topic, subject or exam; 2: the words are spread out. */
  match_rank: number
}

/** A row of the formula_catalog view. Counts published questions only. */
export interface FormulaCatalogRow extends Omit<Formula, 'created_at'> {
  question_count: number
  /** The published questions that use the formula, by code; empty if none. */
  question_ids: string[]
}

/**
 * A row returned by admin_question_stats() (admins only): one per question,
 * of any status. bigints, returned as numbers.
 */
export interface AdminQuestionStats {
  question_id: string
  attempts: number
  /** Distinct learners who attempted it. */
  learners: number
  /** Graded attempts (correct or incorrect). Accuracy = correct / answered. */
  answered: number
  /** Solved independently or after a hint. */
  correct: number
  revealed: number
  skipped: number
  open_reports: number
}

/**
 * A row returned by admin_users() (admins only): every learner, newest first.
 * bigints, returned as numbers.
 */
export interface AdminUserRow {
  id: string
  full_name: string
  email: string
  state: string | null
  country: string
  role: Role
  is_suspended: boolean
  created_at: string
  attempts: number
  /** Leaderboard points, from published questions. */
  points: number
  /** The latest attempt; null before the first. */
  last_active: string | null
}

/** A row returned by get_leaderboard(). */
export interface LeaderboardRow {
  /** bigint, returned by the Data API as a number. Ties share a rank. */
  rank: number
  user_id: string
  full_name: string
  state: string | null
  country: string
  /** bigint, returned by the Data API as a number. */
  points: number
}
