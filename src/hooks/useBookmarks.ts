import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useAuth } from '../auth/useAuth'
import { dbErrorMessage, NETWORK_ERROR, SESSION_EXPIRED } from '../lib/errors'
import { neon } from '../lib/neon'
import { withSessionRecovery } from '../lib/session'
import type { Bookmark, BookmarkList } from '../types'

/** New bookmarks go here. ensure_profile gives every learner this list. */
export const DEFAULT_LIST_NAME = 'Revision'

/** Longest list name the database accepts. */
export const LIST_NAME_MAX = 40

const SIGN_IN = 'Sign in to bookmark questions.'

// One copy of the learner's bookmarks, kept outside React so every bookmark
// button and the Revision page show the same thing. A change shows straight
// away and is saved in the background; if the save fails, the change is
// dropped, which puts back what the database still holds. Saves for one
// question run one after another, so they reach the database in order.

interface Change {
  questionId: string
  /** The list to put the question in, or null to remove the bookmark. */
  listId: string | null
  at: string
}

type Status = 'loading' | 'ready' | 'error'

interface Store {
  userId: string
  status: Status
  error: string | null
  lists: BookmarkList[]
  /** What the database holds, by question id. */
  saved: Map<string, Bookmark>
  /** Changes still being saved, oldest first. */
  pending: Change[]
  /** The latest save per question, which the next one waits for. */
  queues: Map<string, Promise<unknown>>
  loading: Promise<void> | null
}

interface Snapshot {
  userId: string
  status: Status
  error: string | null
  /** Oldest first, so "Revision" leads. */
  lists: BookmarkList[]
  /** By question id, with unsaved changes applied. */
  bookmarks: ReadonlyMap<string, Bookmark>
}

let store: Store | null = null
let snapshot: Snapshot | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => snapshot

function applyChange(bookmarks: Map<string, Bookmark>, userId: string, { questionId, listId, at }: Change) {
  if (listId === null) {
    bookmarks.delete(questionId)
    return
  }
  const current = bookmarks.get(questionId)
  bookmarks.set(
    questionId,
    current
      ? { ...current, list_id: listId }
      : { user_id: userId, question_id: questionId, list_id: listId, created_at: at },
  )
}

function view(s: Store): Snapshot {
  const bookmarks = new Map(s.saved)
  for (const change of s.pending) applyChange(bookmarks, s.userId, change)
  return { userId: s.userId, status: s.status, error: s.error, lists: s.lists, bookmarks }
}

function emit(s: Store) {
  if (s !== store) return
  snapshot = view(s)
  for (const listener of listeners) listener()
}

/** The store for `userId`, starting an empty one when the learner changes. */
function storeFor(userId: string) {
  if (store?.userId !== userId) {
    store = {
      userId,
      status: 'loading',
      error: null,
      lists: [],
      saved: new Map(),
      pending: [],
      queues: new Map(),
      loading: null,
    }
    emit(store)
  }
  return store
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : NETWORK_ERROR)

async function fetchBookmarks(userId: string) {
  const [lists, bookmarks] = await Promise.all([
    withSessionRecovery(() =>
      neon.from('bookmark_lists').select('*').eq('user_id', userId).order('created_at').order('name'),
    ),
    withSessionRecovery(() => neon.from('bookmarks').select('*').eq('user_id', userId)),
  ])
  for (const { error, status, expired } of [lists, bookmarks]) {
    if (error) throw new Error(expired ? SESSION_EXPIRED : dbErrorMessage(error, status))
  }
  return { lists: lists.data as BookmarkList[], bookmarks: bookmarks.data as Bookmark[] }
}

/** Fetches the lists and bookmarks again. Calls made while one runs share it. */
function load(s: Store) {
  s.loading ??= fetchBookmarks(s.userId)
    .then(
      ({ lists, bookmarks }) => {
        s.lists = lists
        s.saved = new Map(bookmarks.map((b) => [b.question_id, b]))
        s.status = 'ready'
        s.error = null
      },
      (err: unknown) => {
        // Bookmarks loaded earlier stay on screen.
        if (s.status !== 'ready') {
          s.status = 'error'
          s.error = errorMessage(err)
        }
        throw err
      },
    )
    .finally(() => {
      s.loading = null
      emit(s)
    })
  return s.loading
}

/** The list a question is in, counting unsaved changes; null when not bookmarked. */
function currentList(s: Store, questionId: string) {
  let listId = s.saved.get(questionId)?.list_id ?? null
  for (const change of s.pending) if (change.questionId === questionId) listId = change.listId
  return listId
}

function saveRequest(userId: string, { questionId, listId }: Change, exists: boolean) {
  const bookmarks = neon.from('bookmarks')
  if (listId === null) return bookmarks.delete().eq('user_id', userId).eq('question_id', questionId)
  if (exists) return bookmarks.update({ list_id: listId }).eq('user_id', userId).eq('question_id', questionId)
  return bookmarks.insert({ question_id: questionId, list_id: listId })
}

async function save(s: Store, change: Change): Promise<string | null> {
  try {
    const exists = s.saved.has(change.questionId)
    if ((s.saved.get(change.questionId)?.list_id ?? null) === change.listId) return null
    let result = await withSessionRecovery(() => saveRequest(s.userId, change, exists))
    // Bookmarked in the meantime, e.g. in another tab: move it instead.
    if (result.error?.code === '23505') result = await withSessionRecovery(() => saveRequest(s.userId, change, true))
    if (result.error) return result.expired ? SESSION_EXPIRED : dbErrorMessage(result.error, result.status)
    applyChange(s.saved, s.userId, change)
    return null
  } catch {
    return NETWORK_ERROR
  } finally {
    s.pending.splice(s.pending.indexOf(change), 1)
    emit(s)
  }
}

/** Shows the change now and saves it. Resolves to an error message, or null once saved. */
function change(s: Store, questionId: string, listId: string | null): Promise<string | null> {
  const next: Change = { questionId, listId, at: new Date().toISOString() }
  s.pending.push(next)
  emit(s)
  const saving = (s.queues.get(questionId) ?? Promise.resolve()).then(() => save(s, next))
  s.queues.set(questionId, saving)
  void saving.then(() => {
    if (s.queues.get(questionId) === saving) s.queues.delete(questionId)
  })
  return saving
}

type CreateListResult = { list: BookmarkList; error?: undefined } | { list?: undefined; error: string }

const duplicateName = (name: string) => `You already have a list called "${name}".`

async function createList(s: Store, name: string): Promise<CreateListResult> {
  const trimmed = name.trim()
  try {
    const { data, error, status, expired } = await withSessionRecovery(() =>
      neon.from('bookmark_lists').insert({ name: trimmed }).select().single(),
    )
    if (error) {
      if (error.code === '23505') return { error: duplicateName(trimmed) }
      return { error: expired ? SESSION_EXPIRED : dbErrorMessage(error, status) }
    }
    const list = data as BookmarkList
    s.lists = [...s.lists, list]
    emit(s)
    return { list }
  } catch {
    return { error: NETWORK_ERROR }
  }
}

/** Bookmarks the question in the default list, or removes its bookmark. */
async function toggle(s: Store, questionId: string): Promise<string | null> {
  try {
    if (s.status !== 'ready') await load(s)
  } catch (err) {
    return `Couldn't load your bookmarks. ${errorMessage(err)}`
  }
  if (currentList(s, questionId) !== null) return change(s, questionId, null)

  let list = s.lists.find((l) => l.name === DEFAULT_LIST_NAME) ?? s.lists[0]
  if (!list) {
    const created = await createList(s, DEFAULT_LIST_NAME)
    if (created.error !== undefined) return created.error
    list = created.list
  }
  return change(s, questionId, list.id)
}

/** Why `name` can't be used for a new list, or null if it can. */
export function listNameError(name: string, lists: BookmarkList[]) {
  const trimmed = name.trim()
  if (!trimmed) return 'Enter a name for the list.'
  // The database counts characters, not UTF-16 units.
  if ([...trimmed].length > LIST_NAME_MAX) return `Keep the name to ${LIST_NAME_MAX} characters or fewer.`
  const same = lists.find((l) => l.name.trim().toLowerCase() === trimmed.toLowerCase())
  return same ? duplicateName(same.name) : null
}

/**
 * Fetches the signed-in learner's lists and bookmarks again, for pages that
 * must be up to date. Resolves to the bookmarked question ids.
 */
export async function loadBookmarks(userId: string) {
  const s = storeFor(userId)
  await load(s)
  return [...view(s).bookmarks.keys()]
}

const NO_LISTS: BookmarkList[] = []
const NO_BOOKMARKS: ReadonlyMap<string, Bookmark> = new Map()

/**
 * The signed-in learner's bookmark lists and bookmarks, loaded once and
 * shared by every component, with actions that update them optimistically.
 * Each action resolves to an error message (after rolling back), or null.
 */
export function useBookmarks() {
  const auth = useAuth()
  const userId = auth.status === 'signed-in' ? auth.user.id : null
  const current = useSyncExternalStore(subscribe, getSnapshot)

  useEffect(() => {
    if (!userId) return
    const s = storeFor(userId)
    if (s.status !== 'ready') load(s).catch(() => {})
  }, [userId])

  const actions = useMemo(() => {
    const signedOut = Promise.resolve(SIGN_IN)
    return {
      toggle: (questionId: string) => (userId ? toggle(storeFor(userId), questionId) : signedOut),
      move: (questionId: string, listId: string) =>
        userId ? change(storeFor(userId), questionId, listId) : signedOut,
      remove: (questionId: string) => (userId ? change(storeFor(userId), questionId, null) : signedOut),
      createList: (name: string): Promise<CreateListResult> =>
        userId ? createList(storeFor(userId), name) : Promise.resolve({ error: SIGN_IN }),
      retry: () => {
        if (userId) load(storeFor(userId)).catch(() => {})
      },
    }
  }, [userId])

  const mine = userId !== null && current?.userId === userId ? current : null
  const status: Status | 'signed-out' =
    auth.status === 'loading' ? 'loading' : userId === null ? 'signed-out' : (mine?.status ?? 'loading')
  return {
    status,
    error: mine?.error ?? null,
    lists: mine?.lists ?? NO_LISTS,
    bookmarks: mine?.bookmarks ?? NO_BOOKMARKS,
    ...actions,
  }
}

export interface BookmarkToggle {
  /** Signed-out learners get a sign-in link instead of the button. */
  signedIn: boolean
  bookmarked: boolean
  toggle: () => void
  /** What the last click did, or why it failed; null before any click. */
  message: { tone: 'ok' | 'bad'; text: string } | null
}

/** The state of one question's bookmark button. */
export function useBookmarkToggle(questionId: string): BookmarkToggle {
  const { status, lists, bookmarks, toggle } = useBookmarks()
  const [last, setLast] = useState<{ adding: boolean; from: string | null; error: string | null } | null>(null)
  const clicks = useRef(0)
  const bookmark = bookmarks.get(questionId)
  const listName = (listId: string) => lists.find((l) => l.id === listId)?.name ?? DEFAULT_LIST_NAME

  function onToggle() {
    const click = ++clicks.current
    setLast({ adding: !bookmark, from: bookmark ? listName(bookmark.list_id) : null, error: null })
    void toggle(questionId).then((error) => {
      if (error && click === clicks.current) setLast((l) => l && { ...l, error })
    })
  }

  // Shown from the bookmark itself, so it appears as soon as the change does
  // and disappears if the change is rolled back.
  let message: BookmarkToggle['message'] = null
  if (last?.error) message = { tone: 'bad', text: `Couldn't update the bookmark. ${last.error}` }
  else if (last?.adding && bookmark) message = { tone: 'ok', text: `Saved to ${listName(bookmark.list_id)}` }
  else if (last && !last.adding && !bookmark) message = { tone: 'ok', text: `Removed from ${last.from}` }

  return { signedIn: status !== 'signed-out', bookmarked: bookmark !== undefined, toggle: onToggle, message }
}
