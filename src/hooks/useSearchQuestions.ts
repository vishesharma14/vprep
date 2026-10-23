import { useMemo } from 'react'
import { dbErrorMessage, SESSION_EXPIRED } from '../lib/errors'
import { neon } from '../lib/neon'
import { withSessionRecovery } from '../lib/session'
import type { Difficulty, QuestionType, SearchQuestionRow } from '../types'
import { useAsync, type AsyncResult } from './useAsync'

/** Rows asked of search_questions(). */
export const SEARCH_LIMIT = 50

/** What to look for. A blank query with no filter finds nothing. */
export interface QuestionSearch {
  query: string
  /** Exam slug. */
  exam: string | null
  difficulty: Difficulty | null
  type: QuestionType | null
}

async function searchQuestions(search: QuestionSearch): Promise<SearchQuestionRow[]> {
  const { data, error, status, expired } = await withSessionRecovery(() =>
    neon.rpc('search_questions', {
      p_query: search.query || null,
      p_exam: search.exam,
      p_difficulty: search.difficulty,
      p_type: search.type,
      p_limit: SEARCH_LIMIT,
    }),
  )
  if (error) throw new Error(expired ? SESSION_EXPIRED : dbErrorMessage(error, status))
  return data as SearchQuestionRow[]
}

/**
 * Published questions with every word of the query (search_questions), best
 * match first, at most SEARCH_LIMIT. Works signed in or out.
 */
export function useSearchQuestions({ query, exam, difficulty, type }: QuestionSearch): AsyncResult<SearchQuestionRow[]> {
  const load = useMemo(
    () => () => searchQuestions({ query, exam, difficulty, type }),
    [query, exam, difficulty, type],
  )
  return useAsync(load)
}
