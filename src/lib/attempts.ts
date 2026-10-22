import type { AttemptMode, AttemptStatus } from '../types'
import { dbErrorMessage, NETWORK_ERROR, SESSION_EXPIRED } from './errors'
import { neon } from './neon'
import { withSessionRecovery } from './session'

/** "A" for 0, "B" for 1, … */
export const optionLetter = (index: number) => String.fromCharCode(65 + index)

/** Solved, with or without the hint. */
export const isCorrect = (status: AttemptStatus) => status === 'independent' || status === 'hint'

/** Counts toward accuracy: revealed and skipped attempts don't. */
export const isGraded = (status: AttemptStatus) => isCorrect(status) || status === 'incorrect'

/** The status of a submitted answer. Matches the checks in validate_attempt(). */
export function answerStatus(
  selectedIndex: number,
  answerIndex: number,
  hintUsed: boolean,
): Extract<AttemptStatus, 'independent' | 'hint' | 'incorrect'> {
  if (selectedIndex !== answerIndex) return 'incorrect'
  return hintUsed ? 'hint' : 'independent'
}

/** What the app sends; user_id and created_at are set by the database. */
export interface NewAttempt {
  question_id: string
  mode: AttemptMode
  status: AttemptStatus
  /** Null when revealed or skipped. */
  selected_index: number | null
  time_spent_ms: number
}

const MAX_TIME_MS = 86_400_000

// Saves still in flight, and a counter bumped whenever one starts, so
// progress readers can tell their cached copy is out of date and wait for
// the saves before fetching again.
const saving = new Set<Promise<unknown>>()
let revision = 0

/** Changes every time an attempt starts saving. */
export const attemptsRevision = () => revision

/** Resolves once every attempt being saved has succeeded or failed. */
export const attemptsSettled = () => Promise.allSettled(saving)

/** Inserts one attempt for the signed-in learner. Resolves to an error message, or null once saved. */
export function saveAttempt(attempt: NewAttempt): Promise<string | null> {
  const row = {
    ...attempt,
    time_spent_ms: Math.min(MAX_TIME_MS, Math.max(0, Math.round(attempt.time_spent_ms))),
  }
  revision++
  const save = withSessionRecovery(() => neon.from('attempts').insert(row)).then(
    ({ error, status, expired }) => (error ? (expired ? SESSION_EXPIRED : dbErrorMessage(error, status)) : null),
    () => NETWORK_ERROR,
  )
  saving.add(save)
  void save.then(() => saving.delete(save))
  return save
}
