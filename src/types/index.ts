// Domain types. Field names are snake_case to mirror the Supabase (Postgres)
// columns, so query results can be typed without mapping.
// Timestamps are ISO strings, as returned by Supabase.

export interface Exam {
  id: string
  slug: string
  name: string
  description: string | null
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

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface Question {
  id: string
  topic_id: string
  body: string
  /** Option texts, shown as bubbles A, B, C, D… */
  options: string[]
  /** Index into `options` of the correct answer. */
  answer_index: number
  hint: string | null
  explanation: string | null
  difficulty: Difficulty | null
  created_at: string
}

/** How a question attempt ended. */
export type AttemptStatus =
  | 'independent' // correct, with no help
  | 'hint' // correct after opening the hint
  | 'revealed' // answer revealed before answering
  | 'incorrect'
  | 'skipped'

export type AttemptMode = 'practice' | 'timed'

export interface Attempt {
  id: string
  user_id: string
  question_id: string
  mode: AttemptMode
  status: AttemptStatus
  /** Index into the question's `options`; null when skipped or revealed. */
  selected_index: number | null
  time_spent_ms: number
  created_at: string
}
