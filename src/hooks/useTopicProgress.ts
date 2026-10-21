import { useMemo } from 'react'
import { useAuth } from '../auth/useAuth'
import { dbErrorMessage } from '../lib/errors'
import { neon } from '../lib/neon'
import type { TopicProgressRow } from '../types'
import { LOADING, useAsync, type AsyncResult } from './useAsync'
import type { CatalogTopic } from './useExamCatalog'

export type ProgressByTopic = ReadonlyMap<string, TopicProgressRow>

const NO_PROGRESS: ProgressByTopic = new Map()
const loadNoProgress = () => Promise.resolve(NO_PROGRESS)

// The last progress loaded, shown straight away on the next page while a
// fresh copy loads, so moving between pages doesn't flash skeletons.
let cached: { userId: string; progress: ProgressByTopic } | undefined

async function fetchProgress(userId: string): Promise<ProgressByTopic> {
  const { data, error, status } = await neon.from('my_topic_progress').select('*')
  if (error) throw new Error(dbErrorMessage(error, status))
  const progress = new Map((data as TopicProgressRow[]).map((row) => [row.topic_id, row]))
  cached = { userId, progress }
  return progress
}

/**
 * The signed-in learner's progress per topic (my_topic_progress), keyed by
 * topic id. Empty when signed out; loading while the session is still unknown.
 */
export function useTopicProgress(): AsyncResult<ProgressByTopic> & { signedIn: boolean } {
  const auth = useAuth()
  const userId = auth.status === 'signed-in' ? auth.user.id : null
  const load = useMemo(() => (userId ? () => fetchProgress(userId) : loadNoProgress), [userId])
  const result = useAsync(load, userId && cached?.userId === userId ? cached.progress : undefined)

  if (auth.status === 'loading') return { ...LOADING, retry: result.retry, signedIn: false }
  return { ...result, signedIn: userId !== null }
}

export interface ProgressTotals {
  /** Distinct questions tried, capped at each topic's question count. */
  attempted: number
  answered: number
  correct: number
}

export function progressTotals(topics: CatalogTopic[], progress: ProgressByTopic): ProgressTotals {
  const totals = { attempted: 0, answered: 0, correct: 0 }
  for (const topic of topics) {
    const row = progress.get(topic.id)
    if (!row) continue
    totals.attempted += Math.min(row.attempted, topic.question_count)
    totals.answered += row.answered
    totals.correct += row.correct
  }
  return totals
}

/** Accuracy as a whole percentage, or null before any graded answer. */
export function accuracyPercent({ answered, correct }: ProgressTotals) {
  return answered > 0 ? Math.round((correct / answered) * 100) : null
}
