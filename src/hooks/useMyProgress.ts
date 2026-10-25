import { useMemo } from 'react'
import { attemptsRevision, attemptsSettled } from '../lib/attempts'
import { dbErrorMessage, SESSION_EXPIRED } from '../lib/errors'
import { neon } from '../lib/neon'
import { withSessionRecovery } from '../lib/session'
import { ATTEMPT_POINTS, type AttemptStatus, type MyProgress, type MyProgressTotals } from '../types'
import { useAsync, type AsyncResult } from './useAsync'
import { accuracyPercent } from './useTopicProgress'

/** Days of my_progress().daily, ending today. */
export const PROGRESS_DAYS = 14

// As in useTopicProgress: the last copy loaded shows straight away while a
// fresh one loads, and is dropped once the learner saves a new attempt.
let cached: { userId: string; revision: number; progress: MyProgress } | undefined

/** The browser's time zone, e.g. "Asia/Kolkata". Undefined leaves the database's default. */
export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

async function fetchMyProgress(userId: string): Promise<MyProgress> {
  // Count attempts that are still being saved, e.g. right after practice.
  await attemptsSettled()
  const revision = attemptsRevision()
  const { data, error, status, expired } = await withSessionRecovery(() =>
    neon.rpc('my_progress', { p_tz: browserTimeZone(), p_days: PROGRESS_DAYS }),
  )
  if (error) throw new Error(expired ? SESSION_EXPIRED : dbErrorMessage(error, status))
  const progress = data as MyProgress
  cached = { userId, revision, progress }
  return progress
}

const cachedFor = (userId: string) =>
  cached?.userId === userId && cached.revision === attemptsRevision() ? cached.progress : undefined

/** The signed-in learner's totals, streak, days, subjects and topics (my_progress). */
export function useMyProgress(userId: string): AsyncResult<MyProgress> {
  const load = useMemo(() => () => fetchMyProgress(userId), [userId])
  return useAsync(load, cachedFor(userId))
}

/** Correct answers out of graded ones (answers viewed first and skips left out), or null before any. */
export const totalsAccuracy = (t: MyProgressTotals) =>
  accuracyPercent({ correct: t.independent + t.hint, answered: t.independent + t.hint + t.incorrect })

/**
 * True once an attempt has earned leaderboard points. get_leaderboard() leaves
 * out learners with 0 points, so until then the learner isn't listed.
 */
export const hasLeaderboardPoints = (t: MyProgressTotals) =>
  (Object.keys(ATTEMPT_POINTS) as AttemptStatus[]).some((status) => ATTEMPT_POINTS[status] > 0 && t[status] > 0)

/** Attempts solved with no help, out of every attempt except skips; null before any. */
export function independentPercent(t: MyProgressTotals) {
  const tried = t.attempts - t.skipped
  return tried > 0 ? Math.round((t.independent / tried) * 100) : null
}
