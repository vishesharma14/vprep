import { useEffect, useSyncExternalStore } from 'react'
import { adminWrite } from '../lib/admin'
import { contentChanged, contentRevision } from '../lib/content'
import { NETWORK_ERROR } from '../lib/errors'
import { neon } from '../lib/neon'
import { reorder, TABLE, taxonomyError, type ExamInput, type Level, type Positioned } from '../lib/taxonomy'
import { LOADING, type AsyncResult, type AsyncState } from './useAsync'
import { loadCatalog, type CatalogExam } from './useExamCatalog'

// The admin tabs share one copy of the catalog, kept outside React like the
// questions (useAdminQuestions). After each change to an exam, subject or
// topic it is fetched again; the copy already loaded stays on screen meanwhile.
let state: AsyncState<CatalogExam[]> = LOADING
let loading: Promise<boolean> | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => state

function setState(next: AsyncState<CatalogExam[]>) {
  state = next
  for (const listener of listeners) listener()
}

/**
 * Fetches the catalog for the current content revision; calls made while one
 * runs share it. Resolves to false if it couldn't be fetched.
 */
function load() {
  if (state.status === 'error') setState(LOADING)
  loading ??= (async () => {
    try {
      let exams: CatalogExam[]
      let seen: number
      // A change saved while fetching means the result may already be out of date.
      do {
        seen = contentRevision()
        exams = await loadCatalog()
      } while (seen !== contentRevision())
      setState({ status: 'ready', data: exams, error: undefined })
      return true
    } catch (err) {
      // The catalog loaded earlier stays on screen.
      if (state.status !== 'ready') {
        setState({ status: 'error', data: undefined, error: err instanceof Error ? err.message : NETWORK_ERROR })
      }
      return false
    } finally {
      loading = null
    }
  })()
  return loading
}

/** Exams with their subjects and topics, shared by the admin tabs and fetched again after every change. */
export function useAdminCatalog(): AsyncResult<CatalogExam[]> {
  const current = useSyncExternalStore(subscribe, getSnapshot)
  useEffect(() => {
    void load()
  }, [])
  return { ...current, retry: () => void load() }
}

const NOT_SHOWN = "Done, but the updated list couldn't be loaded. Reload the page to see it."

const notFound = (level: Level) => `Couldn't find this ${level}. It may have been deleted. Reload the page and try again.`

/** Marks the content as changed (learners' cached copies too) and fetches the catalog again. */
async function refresh() {
  contentChanged()
  return (await load()) ? null : NOT_SHOWN
}

type Request = Parameters<typeof adminWrite>[0]

/** Runs a write that returns the rows it touched, then shows the change. Resolves to an error message, or null. */
async function change(level: Level, request: Request) {
  const result = await adminWrite<{ id: string }>(request, taxonomyError)
  if (result.error !== undefined) return result.error
  if (result.rows.length === 0) return notFound(level)
  return refresh()
}

// Each resolves to null once saved and shown, or a message to show.

/** Adds an exam at `position`. */
export function addExam(input: ExamInput, position: number) {
  return change('exam', () => neon.from('exams').insert({ ...input, position }).select('id'))
}

/** Saves an exam's name, full name and category. Its slug is in its address, so it stays. */
export function updateExam(id: string, { name, full_name, category }: ExamInput) {
  return change('exam', () => neon.from('exams').update({ name, full_name, category }).eq('id', id).select('id'))
}

const PARENT = { subject: 'exam_id', topic: 'subject_id' } as const

/** Adds a subject to an exam, or a topic to a subject. */
export function addItem(
  level: 'subject' | 'topic',
  parentId: string,
  item: { name: string; slug: string; position: number },
) {
  return change(level, () =>
    neon
      .from(TABLE[level])
      .insert({ ...item, [PARENT[level]]: parentId })
      .select('id'),
  )
}

export function renameItem(level: Level, id: string, name: string) {
  return change(level, () => neon.from(TABLE[level]).update({ name }).eq('id', id).select('id'))
}

/** Swaps the item at `index` of `items` (in the order shown) with its neighbour `step` away. */
export async function moveItem(level: Level, items: Positioned[], index: number, step: -1 | 1) {
  const moves = reorder(items, index, step)
  if (moves.length === 0) return null
  const results = await Promise.all(
    moves.map(({ id, position }) =>
      adminWrite<{ id: string }>(
        () => neon.from(TABLE[level]).update({ position }).eq('id', id).select('id'),
        taxonomyError,
      ),
    ),
  )
  // Fetched again even if one failed, as the others may have moved.
  const shown = await refresh()
  const failed = results.find((result) => result.error !== undefined)?.error
  if (failed) return failed
  if (results.some((result) => result.rows?.length === 0)) return notFound(level)
  return shown
}

/**
 * Deletes an exam, subject or topic. The database refuses while it has
 * questions; deleting an exam or subject deletes its subjects and topics.
 */
export function deleteItem(level: Level, id: string) {
  return change(level, () => neon.from(TABLE[level]).delete().eq('id', id).select('id'))
}
