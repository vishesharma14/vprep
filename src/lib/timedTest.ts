import type { PracticeResult } from '../components/practice/Summary'
import type { PracticeQuestion } from '../hooks/usePracticeSet'
import type { Subject, Topic } from '../types'
import { answerStatus, isCorrect } from './attempts'

// A running timed test lives in sessionStorage, so an accidental refresh (or
// leaving the page and coming back) resumes it with the same deadline. Only
// question ids are stored; the questions are loaded again on resume. Grading
// a submitted test is here too.

const STORAGE_KEY = 'vprep:timed-test'

export interface RunningTest {
  version: 1
  /** The /test scope it was started from, e.g. "exam:gate-cse". */
  scope: string
  /** In test order. */
  questionIds: string[]
  /** The option chosen for each question, or null. */
  answers: Array<number | null>
  marked: boolean[]
  /** Index of the question on screen. */
  current: number
  /** How long each question has been on screen, in ms. */
  spent: number[]
  startedAt: number
  /** When time runs out, in ms since the epoch. */
  deadline: number
}

export function newTest(scope: string, questionIds: string[], secondsPerQuestion: number): RunningTest {
  const now = Date.now()
  const each = <T>(value: T) => questionIds.map(() => value)
  return {
    version: 1,
    scope,
    questionIds,
    answers: each(null),
    marked: each(false),
    current: 0,
    spent: each(0),
    startedAt: now,
    deadline: now + questionIds.length * secondsPerQuestion * 1000,
  }
}

function isRunningTest(value: unknown, scope: string): value is RunningTest {
  const t = value as Partial<RunningTest> | null
  if (!t || t.version !== 1 || t.scope !== scope || !Array.isArray(t.questionIds)) return false
  const n = t.questionIds.length
  const listOf = (list: unknown, ok: (item: unknown) => boolean) =>
    Array.isArray(list) && list.length === n && list.every(ok)
  const isCount = (x: unknown) => Number.isInteger(x) && (x as number) >= 0
  return (
    n > 0 &&
    listOf(t.questionIds, (id) => typeof id === 'string') &&
    listOf(t.answers, (a) => a === null || isCount(a)) &&
    listOf(t.marked, (m) => typeof m === 'boolean') &&
    listOf(t.spent, (ms) => Number.isFinite(ms) && (ms as number) >= 0) &&
    isCount(t.current) &&
    (t.current as number) < n &&
    Number.isFinite(t.startedAt) &&
    Number.isFinite(t.deadline)
  )
}

/** The test running in this tab for `scope`, if there is one. */
export function loadRunningTest(scope: string): RunningTest | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const test: unknown = raw ? JSON.parse(raw) : null
    return isRunningTest(test, scope) ? test : null
  } catch {
    return null
  }
}

export function saveRunningTest(test: RunningTest) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(test))
  } catch {
    // Storage unavailable: a refresh starts the test over.
  }
}

export function clearRunningTest() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear.
  }
}

/** The saved test, minus any question no longer published. Null if none are left. */
export function resumable(test: RunningTest, byId: Map<string, PracticeQuestion>): RunningTest | null {
  const keep = test.questionIds.flatMap((id, i) => (byId.has(id) ? [i] : []))
  if (keep.length === 0) return null
  const pick = <T,>(list: T[]) => keep.map((i) => list[i])
  const questionIds = pick(test.questionIds)
  return {
    ...test,
    questionIds,
    // An option that no longer exists counts as no answer.
    answers: pick(test.answers).map((a, i) => (a !== null && a < byId.get(questionIds[i])!.options.length ? a : null)),
    marked: pick(test.marked),
    spent: pick(test.spent),
    current: Math.max(0, keep.indexOf(test.current)),
  }
}

/** Same rules as practice, without hints: right, wrong, or skipped when unanswered. */
export function grade(test: RunningTest, byId: Map<string, PracticeQuestion>): PracticeResult[] {
  return test.questionIds.map((id, i) => {
    const question = byId.get(id)!
    const selectedIndex = test.answers[i]
    return {
      question,
      status: selectedIndex === null ? 'skipped' : answerStatus(selectedIndex, question.answer_index, false),
      selectedIndex,
      timeSpentMs: test.spent[i],
    }
  })
}

export interface TopicScore {
  topic: Topic
  subject: Subject
  correct: number
  total: number
}

/** Correct answers per topic, weakest first. */
export function topicScores(results: PracticeResult[]) {
  const scores = new Map<string, TopicScore>()
  for (const { question, status } of results) {
    const score = scores.get(question.topic.id) ?? { topic: question.topic, subject: question.subject, correct: 0, total: 0 }
    score.total++
    if (isCorrect(status)) score.correct++
    scores.set(question.topic.id, score)
  }
  return [...scores.values()].sort(
    (a, b) =>
      a.correct / a.total - b.correct / b.total || b.total - a.total || a.topic.name.localeCompare(b.topic.name),
  )
}

/** A shuffled copy (Fisher–Yates). */
export function shuffle<T>(items: readonly T[]) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const item = copy[i]
    copy[i] = copy[j]
    copy[j] = item
  }
  return copy
}
