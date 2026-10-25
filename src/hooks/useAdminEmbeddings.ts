import { useMemo } from 'react'
import { adminRejected } from '../lib/admin'
import { dbErrorMessage, SESSION_EXPIRED } from '../lib/errors'
import { neon } from '../lib/neon'
import { withSessionRecovery } from '../lib/session'
import type { AdminSimilarQuestionRow, EmbeddingStatus } from '../types'
import { useAsync, type AsyncResult } from './useAsync'

/** Questions listed in the editor's "Similar questions" panel. */
export const ADMIN_SIMILAR_LIMIT = 5

async function fetchAdminSimilar(questionId: string): Promise<AdminSimilarQuestionRow[]> {
  const { data, error, status, expired } = await withSessionRecovery(
    () => neon.rpc('admin_similar_questions', { p_question_id: questionId, p_limit: ADMIN_SIMILAR_LIMIT }),
    adminRejected,
  )
  if (error) throw new Error(expired ? SESSION_EXPIRED : dbErrorMessage(error, status))
  return data as AdminSimilarQuestionRow[]
}

const none = async (): Promise<AdminSimilarQuestionRow[]> => []

/**
 * The ADMIN_SIMILAR_LIMIT questions nearest to this one, of any status and in
 * any exam (admin_similar_questions), to spot duplicates. Empty when the
 * question has no embedding, and for a new question (`questionId` null).
 */
export function useAdminSimilarQuestions(questionId: string | null): AsyncResult<AdminSimilarQuestionRow[]> {
  const load = useMemo(() => (questionId ? () => fetchAdminSimilar(questionId) : none), [questionId])
  return useAsync(load)
}

async function fetchEmbeddingStatus(): Promise<EmbeddingStatus> {
  const { data, error, status, expired } = await withSessionRecovery(
    () => neon.rpc('admin_embedding_status'),
    adminRejected,
  )
  if (error) throw new Error(expired ? SESSION_EXPIRED : dbErrorMessage(error, status))
  // The function returns a table of one row.
  return (data as EmbeddingStatus[])[0]
}

/** How many questions have an embedding, lack one or changed since (admin_embedding_status). */
export function useEmbeddingStatus(): AsyncResult<EmbeddingStatus> {
  return useAsync(fetchEmbeddingStatus)
}
