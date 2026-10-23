import type { ReportReason } from '../types'
import { dbErrorMessage, NETWORK_ERROR, SESSION_EXPIRED } from './errors'
import { neon } from './neon'
import { withSessionRecovery } from './session'

/** Longest note the database accepts. */
export const REPORT_NOTE_MAX = 1000

/** In the order the report form lists them. */
export const REPORT_REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: 'wrong_answer', label: 'The answer is wrong' },
  { value: 'explanation_unclear', label: "The explanation isn't clear" },
  { value: 'question_unclear', label: "The question isn't clear" },
  { value: 'typo', label: "There's a typo" },
  { value: 'other', label: 'Something else' },
]

/** What the app sends; user_id, status and created_at are set by the database. */
export interface NewReport {
  question_id: string
  reason: ReportReason
  /** Null when the learner added no note. */
  note: string | null
}

/** Files a report as the signed-in learner. Resolves to an error message, or null once saved. */
export function sendReport(report: NewReport): Promise<string | null> {
  return withSessionRecovery(() => neon.from('reports').insert(report)).then(
    ({ error, status, expired }) => (error ? (expired ? SESSION_EXPIRED : dbErrorMessage(error, status)) : null),
    () => NETWORK_ERROR,
  )
}
