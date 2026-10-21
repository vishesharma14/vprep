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
