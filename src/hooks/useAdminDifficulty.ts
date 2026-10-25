import { adminRejected } from '../lib/admin'
import { dbErrorMessage, SESSION_EXPIRED } from '../lib/errors'
import { neon } from '../lib/neon'
import { withSessionRecovery } from '../lib/session'
import type { AdminQuestionDifficultyRow } from '../types'
import { useAsync, type AsyncResult } from './useAsync'

async function fetchQuestionDifficulty(): Promise<AdminQuestionDifficultyRow[]> {
  const { data, error, status, expired } = await withSessionRecovery(
    () => neon.rpc('admin_question_difficulty'),
    adminRejected,
  )
  if (error) throw new Error(expired ? SESSION_EXPIRED : dbErrorMessage(error, status))
  return data as AdminQuestionDifficultyRow[]
}

/** Every question, with the level set next to what learners' first answers say (admin_question_difficulty). */
export function useQuestionDifficulty(): AsyncResult<AdminQuestionDifficultyRow[]> {
  return useAsync(fetchQuestionDifficulty)
}
