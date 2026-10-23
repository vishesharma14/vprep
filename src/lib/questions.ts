import type { Difficulty, Question, QuestionStatus, QuestionType } from '../types'
import { optionLetter } from './attempts'

// The rules the questions table enforces (db/migrations/0001_schema.sql),
// checked in the editor first so admins get a clear message.

export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 6
export const YEAR_MIN = 1950
export const YEAR_MAX = 2100

export const QUESTION_STATUS_LABEL: Record<QuestionStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  published: 'Published',
}

/** The columns the editor writes; code, created_by and the timestamps are set by the database. */
export type QuestionInput = Pick<
  Question,
  | 'topic_id'
  | 'subtopic'
  | 'difficulty'
  | 'type'
  | 'year'
  | 'source'
  | 'body'
  | 'options'
  | 'answer_index'
  | 'hint'
  | 'explanation'
  | 'formula_id'
  | 'tags'
  | 'status'
>

/** The editor's fields as typed. Selects hold '' for "none chosen". */
export interface QuestionForm {
  examId: string
  subjectId: string
  topicId: string
  subtopic: string
  /** Comma separated. */
  tags: string
  body: string
  options: string[]
  /** Null until the correct option is chosen. */
  answerIndex: number | null
  hint: string
  explanation: string
  formulaId: string
  difficulty: Difficulty
  type: QuestionType
  year: string
  source: string
  status: QuestionStatus
}

export const NEW_QUESTION: QuestionForm = {
  examId: '',
  subjectId: '',
  topicId: '',
  subtopic: '',
  tags: '',
  body: '',
  options: ['', '', '', ''],
  answerIndex: null,
  hint: '',
  explanation: '',
  formulaId: '',
  difficulty: 'medium',
  type: 'practice',
  year: '',
  source: '',
  status: 'draft',
}

/** Fields that can be wrong, in the order they appear in the editor. */
export const QUESTION_FIELDS = ['topic', 'body', 'options', 'answer', 'explanation', 'year'] as const
export type QuestionField = (typeof QUESTION_FIELDS)[number]
export type QuestionErrors = Partial<Record<QuestionField, string>>

const isBlank = (text: string | null | undefined) => !text?.trim()

/** True when the question can be published: it has an explanation. */
export const canPublish = (question: Pick<Question, 'explanation'>) => !isBlank(question.explanation)

/** Indexes of the options with no text. */
export const blankOptions = (options: string[]) => options.flatMap((text, i) => (isBlank(text) ? [i] : []))

const listFormat = new Intl.ListFormat('en', { type: 'conjunction' })

/** "1955" → 1955; null when `text` isn't a whole year in range. */
export function parseYear(text: string) {
  const year = /^\d{4}$/.test(text.trim()) ? Number(text) : NaN
  return year >= YEAR_MIN && year <= YEAR_MAX ? year : null
}

/** What is wrong with the form, by field; empty when it can be saved. */
export function questionErrors(form: QuestionForm): QuestionErrors {
  const errors: QuestionErrors = {}

  // Shown on the first of the three selects still to choose.
  if (!form.examId) errors.topic = 'Choose an exam, then a subject and topic.'
  else if (!form.subjectId) errors.topic = 'Choose a subject, then a topic.'
  else if (!form.topicId) errors.topic = 'Choose a topic.'
  if (isBlank(form.body)) errors.body = 'Write the question.'

  const blank = blankOptions(form.options)
  if (form.options.length < MIN_OPTIONS || form.options.length > MAX_OPTIONS) {
    errors.options = `Give ${MIN_OPTIONS} to ${MAX_OPTIONS} options.`
  } else if (blank.length > 0) {
    const letters = listFormat.format(blank.map(optionLetter))
    errors.options =
      blank.length === 1 ? `Fill in option ${letters}, or remove it.` : `Fill in options ${letters}, or remove them.`
  }
  if (form.answerIndex === null || form.answerIndex < 0 || form.answerIndex >= form.options.length) {
    errors.answer = 'Choose the correct option.'
  }

  if (form.status === 'published' && isBlank(form.explanation)) {
    errors.explanation = 'Add an explanation to publish, or save it as a draft or for review.'
  }
  if (form.type === 'pyq' && parseYear(form.year) === null) {
    errors.year = isBlank(form.year)
      ? 'A PYQ needs the year it was asked.'
      : `Enter a year between ${YEAR_MIN} and ${YEAR_MAX}.`
  }
  return errors
}

/** "a, b , ,a" → ["a", "b"]. */
export function parseTags(text: string) {
  return [...new Set(text.split(',').map((tag) => tag.trim()).filter(Boolean))]
}

const orNull = (text: string) => text.trim() || null

/** The row to save, from a form with no errors: text trimmed, blank optional fields null. */
export function questionInput(form: QuestionForm): QuestionInput {
  return {
    topic_id: form.topicId,
    subtopic: orNull(form.subtopic),
    difficulty: form.difficulty,
    type: form.type,
    // The year is only asked for PYQs.
    year: form.type === 'pyq' ? parseYear(form.year) : null,
    source: orNull(form.source),
    body: form.body.trim(),
    options: form.options.map((text) => text.trim()),
    answer_index: form.answerIndex ?? 0,
    hint: orNull(form.hint),
    explanation: orNull(form.explanation),
    formula_id: form.formulaId || null,
    tags: parseTags(form.tags),
    status: form.status,
  }
}

/** Messages for the questions table's CHECK constraints, by name. */
const CHECKS: Record<string, string> = {
  questions_body_check: 'Write the question.',
  questions_options_check: `Give ${MIN_OPTIONS} to ${MAX_OPTIONS} options.`,
  options_not_blank: 'Every option needs some text.',
  questions_answer_index_check: 'Choose the correct option.',
  answer_in_range: 'Choose the correct option.',
  pyq_needs_year: 'A PYQ needs the year it was asked.',
  questions_year_check: `Enter a year between ${YEAR_MIN} and ${YEAR_MAX}.`,
  published_needs_explanation: 'Add an explanation before publishing.',
  questions_difficulty_check: 'Choose easy, medium or hard.',
  questions_type_check: 'Choose practice or PYQ.',
  questions_status_check: 'Choose draft, in review or published.',
}

/**
 * A clearer message for a save the database turned down because of one of the
 * rules above or a missing topic or formula; null for any other error.
 */
export function questionSaveError(error: { code?: string; message: string }) {
  if (error.code === '23514') {
    const check = Object.keys(CHECKS).find((name) => error.message.includes(`"${name}"`))
    return check ? CHECKS[check] : null
  }
  if (error.code === '23503') {
    if (error.message.includes('formula')) return 'The linked formula no longer exists. Choose another one.'
    if (error.message.includes('topic')) return 'That topic no longer exists. Choose another one.'
  }
  return null
}
