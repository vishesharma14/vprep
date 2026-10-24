import { useMemo } from 'react'
import { useAuth } from '../auth/useAuth'
import { attemptsRevision, attemptsSettled } from '../lib/attempts'
import { dbErrorMessage, SESSION_EXPIRED } from '../lib/errors'
import { neon } from '../lib/neon'
import { withSessionRecovery } from '../lib/session'
import type { LeaderboardRow, MyProgressTotals } from '../types'
import { useAsync, type AsyncResult } from './useAsync'
import { hasLeaderboardPoints } from './useMyProgress'

/** Rows asked of get_leaderboard(): the most it returns. */
export const LEADERBOARD_LIMIT = 500

/** Why a ranking leaves out the signed-in learner, from their my_progress() totals. */
export const notListedMessage = (totals: MyProgressTotals) =>
  hasLeaderboardPoints(totals)
    ? `You're not in the top ${LEADERBOARD_LIMIT} yet. Keep practising.`
    : 'Answer a question correctly to join the leaderboard.'

/** Who is ranked: one country, one state, or everyone when both are null. */
export interface LeaderboardScope {
  country: string | null
  state: string | null
}

export const GLOBAL_SCOPE: LeaderboardScope = { country: null, state: null }

// As in useMyProgress: the last copy of each ranking shows straight away while
// a fresh one loads, and is dropped once the learner saves a new attempt.
// is_me depends on who asked, so each copy is kept per viewer.
const cached = new Map<string, { revision: number; rows: LeaderboardRow[] }>()

const cacheKey = ({ country, state }: LeaderboardScope, viewer: string | null) =>
  JSON.stringify([country, state, viewer])

async function fetchLeaderboard(scope: LeaderboardScope, viewer: string | null): Promise<LeaderboardRow[]> {
  // Count attempts that are still being saved, e.g. right after practice.
  await attemptsSettled()
  const revision = attemptsRevision()
  const { data, error, status, expired } = await withSessionRecovery(() =>
    neon.rpc('get_leaderboard', { p_country: scope.country, p_state: scope.state, p_limit: LEADERBOARD_LIMIT }),
  )
  if (error) throw new Error(expired ? SESSION_EXPIRED : dbErrorMessage(error, status))
  const rows = data as LeaderboardRow[]
  cached.set(cacheKey(scope, viewer), { revision, rows })
  return rows
}

function cachedFor(scope: LeaderboardScope, viewer: string | null) {
  const hit = cached.get(cacheKey(scope, viewer))
  return hit?.revision === attemptsRevision() ? hit.rows : undefined
}

/**
 * The top learners in `scope` (get_leaderboard), best first; ties share a
 * rank, and suspended learners and learners with 0 points are left out.
 * Works signed in or out, and loads again when the signed-in user changes,
 * so `is_me` marks the current learner.
 */
export function useLeaderboard({ country, state }: LeaderboardScope): AsyncResult<LeaderboardRow[]> {
  const auth = useAuth()
  const viewer = auth.status === 'signed-in' ? auth.user.id : null
  const load = useMemo(() => () => fetchLeaderboard({ country, state }, viewer), [country, state, viewer])
  return useAsync(load, cachedFor({ country, state }, viewer))
}
