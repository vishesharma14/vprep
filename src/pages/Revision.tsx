import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { PageHeader } from '../components/layout/PageHeader'
import { QuestionCard } from '../components/practice/QuestionCard'
import { Button, ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { TextField } from '../components/ui/Field'
import { FilterChips, type FilterChip } from '../components/ui/FilterChips'
import { LoadError } from '../components/ui/LoadError'
import { Notice } from '../components/ui/Notice'
import { LoadingLabel, Skeleton } from '../components/ui/Skeleton'
import { TabPanel, Tabs } from '../components/ui/Tabs'
import { useAsync } from '../hooks/useAsync'
import { LIST_NAME_MAX, listNameError, loadBookmarks, useBookmarks } from '../hooks/useBookmarks'
import { findTopic, loadCatalog } from '../hooks/useExamCatalog'
import { attemptsSettled } from '../lib/attempts'
import { cx } from '../lib/cx'
import { dbErrorMessage, SESSION_EXPIRED } from '../lib/errors'
import { firstLine, formatDate } from '../lib/format'
import { neon } from '../lib/neon'
import { withSessionRecovery } from '../lib/session'
import type { Bookmark, BookmarkList, Exam, MistakeRow, Question, Topic } from '../types'

type Tab = 'bookmarks' | 'mistakes'

type QuestionRow = Pick<Question, 'id' | 'code' | 'body' | 'difficulty' | 'topic_id'>

/** A published question, with its place in the catalog. */
interface RevisionQuestion extends QuestionRow {
  exam: Exam
  topic: Topic
}

interface RevisionData {
  /** The bookmarked and missed questions that are published, by id. */
  questions: ReadonlyMap<string, RevisionQuestion>
  mistakes: MistakeRow[]
}

interface SavedQuestion {
  bookmark: Bookmark
  question: RevisionQuestion
}

interface MistakeItem {
  mistake: MistakeRow
  question: RevisionQuestion
}

// Question ids per request, so the query string stays short.
const IDS_PER_REQUEST = 100

async function fetchMistakes(userId: string) {
  // Count answers still being saved, e.g. straight after practice.
  await attemptsSettled()
  // Admins can read everyone's attempts, so keep to the learner's own.
  const { data, error, status, expired } = await withSessionRecovery(() =>
    neon.from('my_mistakes').select('*').eq('user_id', userId),
  )
  if (error) throw new Error(expired ? SESSION_EXPIRED : dbErrorMessage(error, status))
  return data as MistakeRow[]
}

/** The published questions among `ids`; drafts and questions in review are left out. */
async function fetchPublished(ids: string[]) {
  const requests = []
  for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) {
    requests.push(
      neon
        .from('questions')
        .select('id, code, body, difficulty, topic_id')
        .eq('status', 'published')
        .in('id', ids.slice(i, i + IDS_PER_REQUEST)),
    )
  }
  const results = await Promise.all(requests)
  return results.flatMap(({ data, error, status }) => {
    if (error) throw new Error(dbErrorMessage(error, status))
    return data as QuestionRow[]
  })
}

async function loadRevision(userId: string): Promise<RevisionData> {
  const [bookmarked, mistakes, exams] = await Promise.all([
    loadBookmarks(userId),
    fetchMistakes(userId),
    loadCatalog(),
  ])
  const ids = [...new Set([...bookmarked, ...mistakes.map((m) => m.question_id)])]
  const questions = new Map<string, RevisionQuestion>()
  for (const row of await fetchPublished(ids)) {
    const place = findTopic(exams, row.topic_id)
    if (place) questions.set(row.id, { ...row, exam: place.exam, topic: place.topic })
  }
  return { questions, mistakes }
}

const newestFirst = (a: string, b: string) => Date.parse(b) - Date.parse(a)

function splitMistakes({ questions, mistakes }: RevisionData) {
  const items = mistakes.flatMap((mistake) => {
    const question = questions.get(mistake.question_id)
    return question ? [{ mistake, question }] : []
  })
  return {
    open: items
      .filter((i) => i.mistake.cleared_at === null)
      .sort((a, b) => newestFirst(a.mistake.last_missed_at, b.mistake.last_missed_at)),
    cleared: items
      .filter((i) => i.mistake.cleared_at !== null)
      .sort((a, b) => newestFirst(a.mistake.cleared_at!, b.mistake.cleared_at!)),
  }
}

const practiseHref = (items: Array<{ question: RevisionQuestion }>) =>
  `/practice?ids=${items.map((i) => i.question.id).join(',')}`

export function Revision() {
  const auth = useAuth()
  // RequireAuth renders this page only for signed-in learners.
  if (auth.status !== 'signed-in') return null
  return <RevisionPage userId={auth.user.id} />
}

function RevisionPage({ userId }: { userId: string }) {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'mistakes' ? 'mistakes' : 'bookmarks'
  const load = useMemo(() => () => loadRevision(userId), [userId])
  const data = useAsync(load)
  const { bookmarks } = useBookmarks()
  const tabsId = useId()

  const ready = data.status === 'ready' ? data.data : null
  // Questions that are no longer published are left out without a word.
  const saved = ready
    ? [...bookmarks.values()]
        .flatMap((bookmark) => {
          const question = ready.questions.get(bookmark.question_id)
          return question ? [{ bookmark, question }] : []
        })
        .sort((a, b) => newestFirst(a.bookmark.created_at, b.bookmark.created_at))
    : []
  const mistakes = ready ? splitMistakes(ready) : null

  const panel =
    data.status === 'error' ? (
      <LoadError message={`Couldn't load your revision. ${data.error}`} onRetry={data.retry} />
    ) : !mistakes ? (
      <RevisionSkeleton />
    ) : tab === 'bookmarks' ? (
      <BookmarksPanel saved={saved} panelId={`${tabsId}-panel-bookmarks`} />
    ) : (
      <MistakesPanel open={mistakes.open} cleared={mistakes.cleared} />
    )

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="Revision" description="Questions you saved, and the ones you got wrong." />
      <Tabs
        id={tabsId}
        label="Revision"
        tabs={[
          { id: 'bookmarks', label: mistakes ? `Bookmarks (${saved.length})` : 'Bookmarks' },
          { id: 'mistakes', label: mistakes ? `Mistakes (${mistakes.open.length} open)` : 'Mistakes' },
        ]}
        selected={tab}
        onSelect={(t) => setParams(t === 'mistakes' ? { tab: 'mistakes' } : {}, { replace: true })}
        className="sm:max-w-md"
      />
      <div className="mt-6">
        <TabPanel id={tabsId} tab="bookmarks" selected={tab === 'bookmarks'}>
          {panel}
        </TabPanel>
        <TabPanel id={tabsId} tab="mistakes" selected={tab === 'mistakes'}>
          {panel}
        </TabPanel>
      </div>
    </div>
  )
}

const chipButtonClass = cx(
  'inline-flex h-9 items-center rounded-full border border-dashed border-ink/25 bg-sheet px-4 text-sm font-bold',
  'text-ink/75 transition-colors hover:border-pen hover:text-pen',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen',
)

const selectClass = cx(
  'h-8 min-w-0 max-w-48 rounded-lg border border-ink/15 bg-sheet px-2 text-sm text-ink transition-colors',
  'hover:border-ink/30 focus-visible:border-pen',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen',
)

function BookmarksPanel({ saved, panelId }: { saved: SavedQuestion[]; panelId: string }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { lists, move, remove } = useBookmarks()
  const [creating, setCreating] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [error, setError] = useState<string | null>(null)
  const chipsRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // An unknown ?list= shows every bookmark.
  const selected = lists.find((l) => l.id === params.get('list')) ?? null
  const shown = selected ? saved.filter((s) => s.bookmark.list_id === selected.id) : saved
  const chips: FilterChip[] = [
    { key: 'all', label: 'All', count: saved.length, to: '/revision', active: !selected },
    ...lists.map((list) => ({
      key: list.id,
      label: list.name,
      count: saved.filter((s) => s.bookmark.list_id === list.id).length,
      to: `/revision?list=${list.id}`,
      active: list.id === selected?.id,
    })),
  ]

  /** Says what happened, and shows the error instead if saving fails (the change is rolled back). */
  function track(done: string, saving: Promise<string | null>, failed: string) {
    setError(null)
    setAnnouncement(done)
    void saving.then((err) => {
      if (!err) return
      setAnnouncement('')
      setError(`${failed} ${err}`)
    })
  }

  /** After a question leaves the list, focuses the same control on the one that took its place. */
  function refocus(index: number, control: 'move' | 'remove') {
    requestAnimationFrame(() => {
      const controls = listRef.current?.querySelectorAll<HTMLElement>(`[data-control="${control}"]`) ?? []
      const next = controls.length > 0 ? controls[Math.min(index, controls.length - 1)] : null
      ;(next ?? document.getElementById(panelId))?.focus()
    })
  }

  function onRemove({ question }: SavedQuestion, index: number) {
    track(`Removed ${question.code} from your bookmarks.`, remove(question.id), `Couldn't remove ${question.code}.`)
    refocus(index, 'remove')
  }

  function onMove({ question }: SavedQuestion, list: BookmarkList, index: number) {
    track(`Moved ${question.code} to ${list.name}.`, move(question.id, list.id), `Couldn't move ${question.code}.`)
    if (selected && selected.id !== list.id) refocus(index, 'move')
  }

  function closeForm() {
    setCreating(false)
    requestAnimationFrame(() => chipsRef.current?.querySelector<HTMLElement>('[data-new-list]')?.focus())
  }

  function onCreated(list: BookmarkList) {
    setAnnouncement(`Created the list ${list.name}.`)
    navigate(`/revision?list=${list.id}`, { replace: true })
    closeForm()
  }

  return (
    <div className="flex flex-col gap-4">
      <div ref={chipsRef} className="flex flex-wrap items-center gap-2">
        <FilterChips label="Bookmark lists" chips={chips} />
        <button
          type="button"
          data-new-list
          aria-expanded={creating}
          onClick={() => (creating ? closeForm() : setCreating(true))}
          className={chipButtonClass}
        >
          + New list
        </button>
      </div>
      {creating && <NewListForm onCreated={onCreated} onCancel={closeForm} />}

      <p role="status" className="sr-only">
        {announcement}
      </p>
      {error && <Notice tone="bad">{error}</Notice>}

      {saved.length === 0 ? (
        <Card>
          <p className="text-ink/70">No bookmarks yet. Tap the bookmark icon on any question to save it here.</p>
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <p className="break-words text-ink/70">
            Nothing in {selected?.name} yet. Use the List menu on a bookmark to move it here.
          </p>
        </Card>
      ) : (
        <>
          <ButtonLink to={practiseHref(shown)} className="self-start">
            {shown.length === 1 ? 'Practise this question' : `Practise these ${shown.length}`}
          </ButtonLink>
          <ul
            ref={listRef}
            aria-label={selected ? `Bookmarks in ${selected.name}` : 'All bookmarks'}
            className="flex flex-col gap-3"
          >
            {shown.map((item, i) => (
              <li key={item.question.id}>
                <RevisionCard question={item.question}>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex min-w-0 items-center gap-2 text-sm">
                      <span className="text-ink/60">
                        List<span className="sr-only"> for {item.question.code}</span>
                      </span>
                      <select
                        data-control="move"
                        value={item.bookmark.list_id}
                        onChange={(e) => {
                          const list = lists.find((l) => l.id === e.target.value)
                          if (list) onMove(item, list, i)
                        }}
                        className={selectClass}
                      >
                        {lists.map((list) => (
                          <option key={list.id} value={list.id}>
                            {list.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="ml-auto flex gap-2">
                      <ButtonLink
                        to={`/practice?q=${item.question.id}`}
                        variant="secondary"
                        size="sm"
                        aria-label={`Practise ${item.question.code}`}
                      >
                        Practise
                      </ButtonLink>
                      <Button
                        data-control="remove"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${item.question.code} from bookmarks`}
                        onClick={() => onRemove(item, i)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </RevisionCard>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function NewListForm({ onCreated, onCancel }: { onCreated: (list: BookmarkList) => void; onCancel: () => void }) {
  const { lists, createList } = useBookmarks()
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving) return
    const input = e.currentTarget.querySelector('input')
    const problem = listNameError(name, lists)
    if (problem) {
      setError(problem)
      input?.focus()
      return
    }
    setSaving(true)
    const result = await createList(name)
    setSaving(false)
    if (result.error === undefined) {
      onCreated(result.list)
      return
    }
    setError(result.error)
    input?.focus()
  }

  return (
    <Card>
      <form
        noValidate
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.preventDefault()
          onCancel()
        }}
        className="flex flex-col gap-3"
      >
        <TextField
          label="New list name"
          value={name}
          maxLength={LIST_NAME_MAX}
          autoFocus
          autoComplete="off"
          hint={`Up to ${LIST_NAME_MAX} characters.`}
          error={error}
          onChange={(e) => {
            setName(e.target.value)
            setError(undefined)
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Creating…' : 'Create list'}
          </Button>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}

function MistakesPanel({ open, cleared }: { open: MistakeItem[]; cleared: MistakeItem[] }) {
  const [params] = useSearchParams()
  const showCleared = params.get('show') === 'cleared'
  const items = showCleared ? cleared : open
  const empty = showCleared
    ? 'Nothing cleared yet. Answer an open mistake correctly to clear it.'
    : cleared.length > 0
      ? 'No open mistakes. Nice work.'
      : 'No mistakes yet. Wrong answers from practice and timed tests show up here.'

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink/70">
        Every wrong answer lands here. Solve it correctly later and it moves to Cleared.
      </p>
      <FilterChips
        label="Mistakes"
        chips={[
          { key: 'open', label: 'Open', count: open.length, to: '/revision?tab=mistakes', active: !showCleared },
          {
            key: 'cleared',
            label: 'Cleared',
            count: cleared.length,
            to: '/revision?tab=mistakes&show=cleared',
            active: showCleared,
          },
        ]}
      />

      {items.length === 0 ? (
        <Card>
          <p className="text-ink/70">{empty}</p>
        </Card>
      ) : (
        <>
          {!showCleared && (
            <ButtonLink to={practiseHref(open)} className="self-start">
              Practise all open mistakes
            </ButtonLink>
          )}
          <ul aria-label={showCleared ? 'Cleared mistakes' : 'Open mistakes'} className="flex flex-col gap-3">
            {items.map(({ mistake, question }) => (
              <li key={question.id}>
                <RevisionCard question={question}>
                  {mistake.cleared_at ? (
                    <p className="text-sm text-ok">
                      Cleared <time dateTime={mistake.cleared_at}>{formatDate(mistake.cleared_at)}</time>
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-ink/60">
                        Missed <time dateTime={mistake.last_missed_at}>{formatDate(mistake.last_missed_at)}</time>
                      </p>
                      <ButtonLink
                        to={`/practice?q=${question.id}`}
                        variant="secondary"
                        size="sm"
                        aria-label={`Retry ${question.code}`}
                      >
                        Retry
                      </ButtonLink>
                    </div>
                  )}
                </RevisionCard>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function RevisionCard({ question, children }: { question: RevisionQuestion; children: ReactNode }) {
  return (
    <QuestionCard
      code={question.code}
      exam={question.exam.name}
      topic={question.topic.name}
      difficulty={question.difficulty}
      preview={firstLine(question.body)}
    >
      {children}
    </QuestionCard>
  )
}

function RevisionSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <LoadingLabel>Loading your revision…</LoadingLabel>
      <div className="flex gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} circle className="h-9 w-24" />
        ))}
      </div>
      <ul className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i}>
            <Card className="flex flex-col gap-3">
              <Skeleton className="h-4 w-56 max-w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-8 w-44" />
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
