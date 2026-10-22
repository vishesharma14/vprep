import { useMemo } from 'react'
import { useAuth } from '../auth/useAuth'
import { dbErrorMessage } from '../lib/errors'
import { neon } from '../lib/neon'
import type { Exam, Formula, Question, Subject, Topic } from '../types'
import { useAsync } from './useAsync'
import { findTopic, loadCatalog, type CatalogExam } from './useExamCatalog'

/** What /practice was asked to show, from its query string. */
export type PracticeScope =
  | { kind: 'topic'; id: string }
  | { kind: 'subject'; id: string }
  | { kind: 'exam'; slug: string }
  | { kind: 'ids'; ids: string[] }

/** A published question with its place in the catalog and its formula. */
export interface PracticeQuestion extends Question {
  exam: Exam
  subject: Subject
  topic: Topic
  formula: Formula | null
}

/** The fields needed to suggest a question as similar. */
export type SimilarQuestion = Pick<Question, 'id' | 'code' | 'topic_id' | 'subtopic' | 'tags' | 'body' | 'difficulty'>

export interface PracticeSet {
  /** In practice order: never-attempted first, then by code. */
  questions: PracticeQuestion[]
  /** Every published question in the same topics, for "Similar questions". */
  pool: SimilarQuestion[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (value: string) => UUID.test(value)

const SIMILAR_FIELDS = 'id, code, topic_id, subtopic, tags, body, difficulty'

/** Q999 before Q1000. */
const byCode = new Intl.Collator('en', { numeric: true }).compare

/**
 * Reads ?topic=, ?subject=, ?exam=, ?ids= or ?q= (the first one present).
 * Null when there is none.
 */
export function parseScope(params: URLSearchParams): PracticeScope | null {
  const topic = params.get('topic')
  if (topic) return { kind: 'topic', id: topic }
  const subject = params.get('subject')
  if (subject) return { kind: 'subject', id: subject }
  const exam = params.get('exam')
  if (exam) return { kind: 'exam', slug: exam }
  const ids = params.get('ids')
  if (ids) return { kind: 'ids', ids: [...new Set(ids.split(',').map((id) => id.trim()))].filter(Boolean) }
  const q = params.get('q')
  if (q) return { kind: 'ids', ids: [q] }
  return null
}

/** The topics a scope covers, or null when it is a list of question ids. */
function scopeTopicIds(exams: CatalogExam[], scope: PracticeScope): string[] | null {
  const subjects = exams.flatMap((e) => e.subjects)
  switch (scope.kind) {
    case 'topic':
      return findTopic(exams, scope.id) ? [scope.id] : []
    case 'subject':
      return subjects.find((s) => s.id === scope.id)?.topics.map((t) => t.id) ?? []
    case 'exam':
      return exams.find((e) => e.slug === scope.slug)?.subjects.flatMap((s) => s.topics.map((t) => t.id)) ?? []
    case 'ids':
      return null
  }
}

type QuestionRow = Question & { formulas: Formula | null }

async function fetchQuestions(filter: { topicIds: string[] } | { ids: string[] }) {
  const query = neon.from('questions').select('*, formulas(*)').eq('status', 'published')
  const { data, error, status } = await ('topicIds' in filter
    ? query.in('topic_id', filter.topicIds)
    : query.in('id', filter.ids))
  if (error) throw new Error(dbErrorMessage(error, status))
  return data as QuestionRow[]
}

async function fetchPool(topicIds: string[]) {
  const { data, error, status } = await neon
    .from('questions')
    .select(SIMILAR_FIELDS)
    .eq('status', 'published')
    .in('topic_id', topicIds)
  if (error) throw new Error(dbErrorMessage(error, status))
  return data as SimilarQuestion[]
}

/** The questions, out of `questionIds`, the learner has attempted before. */
async function fetchAttempted(userId: string, questionIds: string[]) {
  // Admins can read everyone's attempts, so filter to the learner's own.
  const { data, error, status } = await neon
    .from('attempts')
    .select('question_id')
    .eq('user_id', userId)
    .in('question_id', questionIds)
  if (error) throw new Error(dbErrorMessage(error, status))
  return new Set((data as Array<{ question_id: string }>).map((row) => row.question_id))
}

const EMPTY_SET: PracticeSet = { questions: [], pool: [] }

async function loadPracticeSet(scope: PracticeScope, userId: string | null): Promise<PracticeSet> {
  const exams = await loadCatalog()
  const topicIds = scopeTopicIds(exams, scope)
  // Malformed ids would make Postgres reject the whole request.
  const ids = scope.kind === 'ids' ? scope.ids.filter(isUuid) : []
  if (topicIds ? topicIds.length === 0 : ids.length === 0) return EMPTY_SET

  const rows = await fetchQuestions(topicIds ? { topicIds } : { ids })
  const questions = rows.flatMap(({ formulas, ...question }) => {
    const place = findTopic(exams, question.topic_id)
    return place ? [{ ...question, ...place, formula: formulas }] : []
  })
  if (questions.length === 0) return EMPTY_SET

  const [attempted, pool] = await Promise.all([
    userId ? fetchAttempted(userId, questions.map((q) => q.id)) : new Set<string>(),
    // A topic, subject or exam already loaded whole topics.
    topicIds ? questions : fetchPool([...new Set(questions.map((q) => q.topic_id))]),
  ])

  questions.sort(
    (a, b) => Number(attempted.has(a.id)) - Number(attempted.has(b.id)) || byCode(a.code, b.code),
  )
  return { questions, pool }
}

// Waits for the session, so signed-in learners get their own order.
const loadNothing = () => new Promise<never>(() => {})

/** The published questions for a scope, ready to practise. */
export function usePracticeSet(scope: PracticeScope) {
  const auth = useAuth()
  const ready = auth.status !== 'loading'
  const userId = auth.status === 'signed-in' ? auth.user.id : null
  const load = useMemo(
    () => (ready ? () => loadPracticeSet(scope, userId) : loadNothing),
    [ready, scope, userId],
  )
  return useAsync(load)
}

/**
 * Up to `limit` other questions from the same topic, those sharing the
 * subtopic or a tag first, then by code.
 */
export function similarQuestions(question: Question, pool: SimilarQuestion[], limit = 3) {
  const score = (other: SimilarQuestion) =>
    (question.subtopic !== null && other.subtopic === question.subtopic ? 2 : 0) +
    (other.tags.some((tag) => question.tags.includes(tag)) ? 1 : 0)
  return pool
    .filter((other) => other.topic_id === question.topic_id && other.id !== question.id)
    .map((other) => ({ other, score: score(other) }))
    .sort((a, b) => b.score - a.score || byCode(a.other.code, b.other.code))
    .slice(0, limit)
    .map(({ other }) => other)
}
