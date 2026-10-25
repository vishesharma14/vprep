import { useMemo } from 'react'
import { dbErrorMessage, SESSION_EXPIRED } from '../lib/errors'
import { neon } from '../lib/neon'
import { withSessionRecovery } from '../lib/session'
import type { SimilarQuestionRow } from '../types'
import { useAsync, type AsyncResult } from './useAsync'

/** Questions offered in the "Similar questions" card. */
export const SIMILAR_LIMIT = 3

async function fetchSimilar(questionId: string): Promise<SimilarQuestionRow[]> {
  const { data, error, status, expired } = await withSessionRecovery(() =>
    neon.rpc('similar_questions', { p_question_id: questionId, p_limit: SIMILAR_LIMIT }),
  )
  if (error) throw new Error(expired ? SESSION_EXPIRED : dbErrorMessage(error, status))
  return data as SimilarQuestionRow[]
}

/**
 * Up to SIMILAR_LIMIT published questions like this one, in the same exam,
 * by their embeddings (similar_questions). Leaves out ones the learner has
 * solved. Works signed in or out; empty when the question has no embedding.
 */
export function useSimilarQuestions(questionId: string): AsyncResult<SimilarQuestionRow[]> {
  const load = useMemo(() => () => fetchSimilar(questionId), [questionId])
  return useAsync(load)
}
