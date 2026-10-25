import { useMemo } from 'react'
import { attemptsRevision, attemptsSettled } from '../lib/attempts'
import { dbErrorMessage, SESSION_EXPIRED } from '../lib/errors'
import { neon } from '../lib/neon'
import { withSessionRecovery } from '../lib/session'
import type { StudyPlanRow } from '../types'
import { useAsync, type AsyncResult } from './useAsync'
import { browserTimeZone } from './useMyProgress'

/** Topics fetched, all shown on Progress. Home shows the first HOME_PLAN_SIZE, so both share one request. */
export const PLAN_SIZE = 5
export const HOME_PLAN_SIZE = 3

// As in useMyProgress: the last plan loaded shows straight away while a fresh
// one loads, and is dropped once the learner saves a new attempt.
let cached: { userId: string; revision: number; plan: StudyPlanRow[] } | undefined

const requestPlan = (timeZone?: string) =>
  withSessionRecovery(() => neon.rpc('recommend_topics', { p_limit: PLAN_SIZE, p_tz: timeZone }))

async function fetchStudyPlan(userId: string): Promise<StudyPlanRow[]> {
  // Count attempts that are still being saved, e.g. right after practice.
  await attemptsSettled()
  const revision = attemptsRevision()
  let result = await requestPlan(browserTimeZone())
  // my_progress() falls back to Asia/Kolkata for a zone Postgres doesn't know;
  // recommend_topics() raises instead, so ask again with its default.
  if (result.error?.message.startsWith('Unknown time zone')) result = await requestPlan()
  const { data, error, status, expired } = result
  if (error) throw new Error(expired ? SESSION_EXPIRED : dbErrorMessage(error, status))
  const plan = data as StudyPlanRow[]
  cached = { userId, revision, plan }
  return plan
}

const cachedFor = (userId: string) =>
  cached?.userId === userId && cached.revision === attemptsRevision() ? cached.plan : undefined

/** The signed-in learner's topics to study next (recommend_topics), highest score first. */
export function useStudyPlan(userId: string): AsyncResult<StudyPlanRow[]> {
  const load = useMemo(() => () => fetchStudyPlan(userId), [userId])
  return useAsync(load, cachedFor(userId))
}
