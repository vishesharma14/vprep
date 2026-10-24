import { useEffect, useSyncExternalStore } from 'react'
import { adminRejected, adminWrite } from '../lib/admin'
import { contentChanged } from '../lib/content'
import { dbErrorMessage, NETWORK_ERROR, SESSION_EXPIRED } from '../lib/errors'
import { neon } from '../lib/neon'
import { questionSaveError, type QuestionInput } from '../lib/questions'
import { withSessionRecovery } from '../lib/session'
import type { AdminQuestionStats, Question, QuestionStatus } from '../types'
import { LOADING, type AsyncResult, type AsyncState } from './useAsync'

/** A question of any status, with how learners have done on it. */
export type AdminQuestion = Question & Omit<AdminQuestionStats, 'question_id'>

type Stats = Omit<AdminQuestionStats, 'question_id'>

const NO_STATS: Stats = { attempts: 0, learners: 0, answered: 0, correct: 0, revealed: 0, skipped: 0, open_reports: 0 }

const statsOf = ({ attempts, learners, answered, correct, revealed, skipped, open_reports }: Stats): Stats => ({
  attempts,
  learners,
  answered,
  correct,
  revealed,
  skipped,
  open_reports,
})

async function fetchAdminQuestions(): Promise<AdminQuestion[]> {
  // Stats first: it checks the user is an admin (getting a new JWT if needed),
  // so the questions that follow include drafts, not only published ones.
  const stats = await withSessionRecovery(() => neon.rpc('admin_question_stats'), adminRejected)
  if (stats.error) throw new Error(stats.expired ? SESSION_EXPIRED : dbErrorMessage(stats.error, stats.status))
  const questions = await withSessionRecovery(() => neon.from('questions').select('*'))
  if (questions.error) {
    throw new Error(questions.expired ? SESSION_EXPIRED : dbErrorMessage(questions.error, questions.status))
  }
  const byId = new Map((stats.data as AdminQuestionStats[]).map((row) => [row.question_id, row]))
  return (questions.data as Question[]).map((question) => {
    const row = byId.get(question.id)
    return { ...question, ...(row ? statsOf(row) : NO_STATS) }
  })
}

// One copy of every question, kept outside React so the admin tabs share it
// and switching tabs doesn't load it again. Saves update it in place.
let state: AsyncState<AdminQuestion[]> = LOADING
let loading: Promise<void> | null = null
/** Bumped by every save, so a load that started before one is not trusted. */
let changes = 0
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => state

function setState(next: AsyncState<AdminQuestion[]>) {
  state = next
  for (const listener of listeners) listener()
}

/** Fetches the questions and stats again. Calls made while one runs share it. */
function load() {
  if (state.status === 'error') setState(LOADING)
  loading ??= (async () => {
    try {
      let rows: AdminQuestion[]
      let seen: number
      do {
        seen = changes
        rows = await fetchAdminQuestions()
      } while (seen !== changes)
      setState({ status: 'ready', data: rows, error: undefined })
    } catch (err) {
      // Questions loaded earlier stay on screen.
      if (state.status !== 'ready') {
        setState({ status: 'error', data: undefined, error: err instanceof Error ? err.message : NETWORK_ERROR })
      }
    } finally {
      loading = null
    }
  })()
  return loading
}

/** Changes the loaded rows, e.g. a report count, without marking the content as changed. */
function patch(change: (rows: AdminQuestion[]) => AdminQuestion[]) {
  changes++
  if (state.status === 'ready') setState({ ...state, data: change(state.data) })
}

function update(change: (rows: AdminQuestion[]) => AdminQuestion[]) {
  contentChanged()
  patch(change)
}

/** Puts a saved question in the store, keeping its stats. */
function put(question: Question) {
  update((rows) => {
    const old = rows.find((row) => row.id === question.id)
    const next = { ...question, ...(old ? statsOf(old) : NO_STATS) }
    return old ? rows.map((row) => (row === old ? next : row)) : [...rows, next]
  })
}

/**
 * Every question with its stats (admin_question_stats), shared by the admin
 * tabs. Fetched again each time a component using it mounts; the copy already
 * loaded shows meanwhile.
 */
export function useAdminQuestions(): AsyncResult<AdminQuestion[]> {
  const current = useSyncExternalStore(subscribe, getSnapshot)
  useEffect(() => {
    void load()
  }, [])
  return { ...current, retry: () => void load() }
}

export type SaveResult = { question: Question; error?: undefined } | { question?: undefined; error: string }

/** What a write came back with: the changed rows, or an error message. */
const write = (request: Parameters<typeof adminWrite>[0]) => adminWrite<Question>(request, questionSaveError)

// Row-level security hides a question from a token that isn't the admin's,
// so an update or delete that matched nothing says so.
const NOT_FOUND = "Couldn't find this question. It may have been deleted. Reload the page and try again."

/**
 * Adds a question (`id` null), whose code the database gives it, or saves
 * changes to one. Resolves to the saved row, or an error message.
 */
export async function saveQuestion(input: QuestionInput, id: string | null): Promise<SaveResult> {
  const result = await write(() =>
    id ? neon.from('questions').update(input).eq('id', id).select() : neon.from('questions').insert(input).select(),
  )
  if (result.error !== undefined) return { error: result.error }
  const question = result.rows[0]
  if (!question) return { error: NOT_FOUND }
  put(question)
  return { question }
}

export type ImportResult = { questions: Question[]; error?: undefined } | { questions?: undefined; error: string }

/**
 * Adds questions in one request, so the database saves all of them or, if
 * any is turned down, none. Resolves to the saved rows, or an error message.
 */
export async function importQuestions(inputs: QuestionInput[]): Promise<ImportResult> {
  const result = await write(() => neon.from('questions').insert(inputs).select())
  if (result.error !== undefined) return { error: result.error }
  const added = result.rows
  update((rows) => [...rows, ...added.map((question) => ({ ...question, ...NO_STATS }))])
  return { questions: added }
}

/** Publishes or unpublishes a question. Resolves to the saved row, or an error message. */
export async function setQuestionStatus(id: string, status: QuestionStatus): Promise<SaveResult> {
  const result = await write(() => neon.from('questions').update({ status }).eq('id', id).select())
  if (result.error !== undefined) return { error: result.error }
  const question = result.rows[0]
  if (!question) return { error: NOT_FOUND }
  put(question)
  return { question }
}

export type DeleteResult =
  | { error: null }
  /** `hasAttempts`: the database keeps questions learners have attempted; unpublish instead. */
  | { error: string; hasAttempts: boolean }

/** Deletes a question. Resolves to null once deleted, or an error message. */
export async function deleteQuestion(id: string): Promise<DeleteResult> {
  try {
    const { data, error, status, expired } = await withSessionRecovery(() =>
      neon.from('questions').delete().eq('id', id).select('id'),
    )
    if (error) {
      // Raised by prevent_delete_attempted_question() (0007_admin.sql).
      if (error.code === 'P0001') return { error: error.message, hasAttempts: true }
      return { error: expired ? SESSION_EXPIRED : dbErrorMessage(error, status), hasAttempts: false }
    }
    if ((data as unknown[]).length === 0) return { error: NOT_FOUND, hasAttempts: false }
  } catch {
    return { error: NETWORK_ERROR, hasAttempts: false }
  }
  update((rows) => rows.filter((row) => row.id !== id))
  return { error: null }
}

/** A report on the question was resolved or dismissed: one fewer is open. */
export function reportClosed(questionId: string) {
  patch((rows) =>
    rows.map((row) => (row.id === questionId ? { ...row, open_reports: Math.max(0, row.open_reports - 1) } : row)),
  )
}

/** A formula was deleted, which the database unlinks from its questions. */
export function formulaDeleted(formulaId: string) {
  update((rows) => rows.map((row) => (row.formula_id === formulaId ? { ...row, formula_id: null } : row)))
}
