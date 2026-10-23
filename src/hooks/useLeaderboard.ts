import { useMemo } from 'react'
import { attemptsRevision, attemptsSettled } from '../lib/attempts'
import { dbErrorMessage, SESSION_EXPIRED } from '../lib/errors'
import { neon } from '../lib/neon'
import { withSessionRecovery } from '../lib/session'
import type { LeaderboardRow } from '../types'
import { useAsync, type AsyncResult } from './useAsync'

/** Rows asked of get_leaderboard(): the most it returns. */
export const LEADERBOARD_LIMIT = 500

/** Who is ranked: one country, one state, or everyone when both are null. */
export interface LeaderboardScope {
  country: string | null
  state: string | null
}

export const GLOBAL_SCOPE: LeaderboardScope = { country: null, state: null }

// As in useMyProgress: the last copy of each ranking shows straight away while
// a fresh one loads, and is dropped once the learner saves a new attempt.
const cached = new Map<string, { revision: number; rows: LeaderboardRow[] }>()

const scopeKey = ({ country, state }: LeaderboardScope) => JSON.stringify([country, state])

async function fetchLeaderboard(scope: LeaderboardScope): Promise<LeaderboardRow[]> {
  // Count attempts that are still being saved, e.g. right after practice.
  await attemptsSettled()
  const revision = attemptsRevision()
  const { data, error, status, expired } = await withSessionRecovery(() =>
    neon.rpc('get_leaderboard', { p_country: scope.country, p_state: scope.state, p_limit: LEADERBOARD_LIMIT }),
  )
  if (error) throw new Error(expired ? SESSION_EXPIRED : dbErrorMessage(error, status))
  const rows = data as LeaderboardRow[]
  cached.set(scopeKey(scope), { revision, rows })
  return rows
}

function cachedFor(scope: LeaderboardScope) {
  const hit = cached.get(scopeKey(scope))
  return hit?.revision === attemptsRevision() ? hit.rows : undefined
}

/**
 * The top learners in `scope` (get_leaderboard), best first; ties share a
 * rank and suspended learners are left out. Works signed in or out.
 */
export function useLeaderboard({ country, state }: LeaderboardScope): AsyncResult<LeaderboardRow[]> {
  const load = useMemo(() => () => fetchLeaderboard({ country, state }), [country, state])
  return useAsync(load, cachedFor({ country, state }))
}
