import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useQuestionDifficulty } from '../../hooks/useAdminDifficulty'
import { deleteQuestion, setQuestionStatus, type AdminQuestion } from '../../hooks/useAdminQuestions'
import { topicPlaces, type CatalogExam, type TopicPlace } from '../../hooks/useExamCatalog'
import { accuracyPercent } from '../../hooks/useTopicProgress'
import { cx } from '../../lib/cx'
import { dataSaysLabel, needsAnswersNote } from '../../lib/difficulty'
import { NETWORK_ERROR } from '../../lib/errors'
import { firstLine, plural } from '../../lib/format'
import { fetchFormulas } from '../../lib/formulas'
import { downloadCsv, exportFileName, questionsCsv } from '../../lib/questionCsv'
import { canPublish, QUESTION_STATUS_LABEL } from '../../lib/questions'
import { matchesEveryWord, searchWords } from '../../lib/search'
import type { AdminQuestionDifficultyRow, QuestionStatus } from '../../types'
import { Percent } from '../progress/Percent'
import { Button, ButtonLink } from '../ui/Button'
import { Card } from '../ui/Card'
import { SelectField, TextField } from '../ui/Field'
import { LoadError } from '../ui/LoadError'
import { Notice } from '../ui/Notice'
import { LoadingLabel, Skeleton } from '../ui/Skeleton'
import { ScrollTable } from './ScrollTable'
import { StatusPill } from './StatusPill'
import { cellClass, headClass, labelClass, pinnedClass, pinnedHeadClass, pinnedHighlightClass } from './table'

type Sort = 'code' | 'reports' | 'accuracy'

const SORTS: Array<{ value: Sort; label: string }> = [
  { value: 'code', label: 'Code' },
  { value: 'reports', label: 'Most reported' },
  { value: 'accuracy', label: 'Lowest accuracy' },
]

const STATUSES: QuestionStatus[] = ['published', 'in_review', 'draft']

/** The list's part of the query string, after ?tab=questions, in this order. */
type Param = 'q' | 'exam' | 'status' | 'sort'
const PARAMS: Param[] = ['q', 'exam', 'status', 'sort']

/** How long typing has to pause before the address catches up. */
const DEBOUNCE_MS = 250

/** Q999 before Q1000. */
const byCode = new Intl.Collator('en', { numeric: true }).compare

/** correct / answered; questions nobody has answered sort last. */
const ratio = (q: AdminQuestion) => (q.answered > 0 ? q.correct / q.answered : Infinity)

const compare: Record<Sort, (a: AdminQuestion, b: AdminQuestion) => number> = {
  code: (a, b) => byCode(a.code, b.code),
  reports: (a, b) => b.open_reports - a.open_reports || byCode(a.code, b.code),
  // Ties go to the question with more answers: its accuracy is surer.
  accuracy: (a, b) => ratio(a) - ratio(b) || b.answered - a.answered || byCode(a.code, b.code),
}

/** What the editor or the import hands back after a save: a message, and the question to point out, if one. */
export interface SavedNotice {
  id: string | null
  text: string
}

/** The location state the list is opened with after a save, if any. */
function savedNotice(state: unknown): SavedNotice | null {
  const saved = (state as { saved?: unknown } | null)?.saved as Partial<SavedNotice> | undefined
  if (typeof saved?.text !== 'string') return null
  return { id: typeof saved.id === 'string' ? saved.id : null, text: saved.text }
}

interface ListNotice {
  tone: 'ok' | 'bad'
  text: string
}

interface QuestionListProps {
  exams: CatalogExam[]
  questions: AdminQuestion[]
}

/** Every question, filtered and sorted from the query string, with row actions. */
export function QuestionList({ exams, questions }: QuestionListProps) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const saved = savedNotice(location.state)
  const [notice, setNotice] = useState<ListNotice | null>(saved && { tone: 'ok', text: saved.text })
  const [exporting, setExporting] = useState(false)
  const noticeRef = useRef<HTMLDivElement>(null)
  const places = useMemo(() => topicPlaces(exams), [exams])
  const difficulty = useQuestionDifficulty()
  const estimates = useMemo(
    () => new Map((difficulty.data ?? []).map((row) => [row.question_id, row])),
    [difficulty.data],
  )

  // Filtering is instant; the address follows once typing pauses.
  const query = params.get('q') ?? ''
  const [text, setText] = useState(query)
  const examParam = params.get('exam')
  const exam = exams.some((e) => e.slug === examParam) ? examParam : null
  const status = STATUSES.find((s) => s === params.get('status')) ?? null
  const sort = SORTS.find((s) => s.value === params.get('sort'))?.value ?? 'code'
  const filtered = text.trim() !== '' || exam !== null || status !== null

  /** Changes some of the list's query string, keeping the rest. Replaces the history entry. */
  const update = useCallback(
    (changes: Partial<Record<Param, string | null>>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams({ tab: 'questions' })
          for (const key of PARAMS) {
            const value = key in changes ? changes[key] : prev.get(key)
            if (value) next.set(key, value)
          }
          return next
        },
        { replace: true },
      ),
    [setParams],
  )

  useEffect(() => {
    if (text === query) return
    const timer = setTimeout(() => update({ q: text }), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text, query, update])

  // A question just saved is scrolled into view, once, when the list opens.
  const [savedId] = useState(saved?.id)
  useEffect(() => {
    if (savedId) document.getElementById(rowId(savedId))?.scrollIntoView({ block: 'nearest' })
  }, [savedId])

  function announce(next: ListNotice, focus = false) {
    setNotice(next)
    // A deleted row takes focus with it, so it moves to the message.
    if (focus) requestAnimationFrame(() => noticeRef.current?.focus())
  }

  const words = searchWords(text)
  const rows = questions
    .filter((q) => {
      const place = places.get(q.topic_id)
      return (
        (exam === null || place?.exam.slug === exam) &&
        (status === null || q.status === status) &&
        matchesEveryWord([q.code, q.body, place?.topic.name ?? null], words)
      )
    })
    .sort(compare[sort])

  function clearFilters() {
    setText('')
    update({ q: null, exam: null, status: null })
  }

  /** Downloads every question, whatever the filters, as CSV that the import reads back. */
  async function exportCsv() {
    setExporting(true)
    try {
      const formulas = await fetchFormulas()
      downloadCsv(exportFileName(new Date()), questionsCsv(questions, { exams, formulas }))
      announce({ tone: 'ok', text: `Exported ${plural(questions.length, 'question')}.` })
    } catch (err) {
      announce({ tone: 'bad', text: `Couldn't export the questions. ${err instanceof Error ? err.message : NETWORK_ERROR}` })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TextField
          label="Find"
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Code, words or topic"
          autoComplete="off"
          spellCheck={false}
        />
        <SelectField label="Exam" value={exam ?? ''} onChange={(e) => update({ exam: e.target.value || null })}>
          <option value="">All exams</option>
          {exams.map((e) => (
            <option key={e.id} value={e.slug}>
              {e.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Status" value={status ?? ''} onChange={(e) => update({ status: e.target.value || null })}>
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {QUESTION_STATUS_LABEL[s]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Sort by"
          value={sort}
          onChange={(e) => update({ sort: e.target.value === 'code' ? null : e.target.value })}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </SelectField>
      </div>

      <div ref={noticeRef} tabIndex={-1} className="outline-none empty:hidden">
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-ink/70">
          {filtered
            ? `Showing ${rows.length} of ${plural(questions.length, 'question')}`
            : plural(questions.length, 'question')}
        </p>
        <div className="flex flex-wrap gap-2">
          {filtered && (
            <Button variant="secondary" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
          <Button variant="secondary" size="sm" disabled={exporting} onClick={exportCsv}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
          <ButtonLink
            to={{ search: '?tab=questions&view=import' }}
            state={{ list: location.search }}
            variant="secondary"
            size="sm"
          >
            Import CSV
          </ButtonLink>
          <ButtonLink to={{ search: '?tab=edit' }} state={{ list: location.search }} size="sm">
            Add question
          </ButtonLink>
        </div>
      </div>

      {difficulty.status === 'error' && (
        <LoadError
          message={`Couldn't load what learners' answers say about difficulty. ${difficulty.error}`}
          onRetry={difficulty.retry}
        />
      )}

      {rows.length === 0 ? (
        <Card>
          <p className="text-ink/70">
            {questions.length === 0 ? 'No questions yet.' : 'No questions match. Try fewer words, or clear a filter.'}
          </p>
        </Card>
      ) : (
        <QuestionTable
          rows={rows}
          places={places}
          estimates={difficulty.status === 'ready' ? estimates : difficulty.status}
          highlight={saved?.id ?? null}
          listSearch={location.search}
          onNotice={announce}
        />
      )}
    </div>
  )
}

const rowId = (questionId: string) => `admin-question-${questionId}`

/** What learners' first answers say about each question's difficulty, by id, or why that isn't known yet. */
type Estimates = ReadonlyMap<string, AdminQuestionDifficultyRow> | 'loading' | 'error'

/** One question's estimate: undefined for a question added since the estimates loaded. */
type Estimate = AdminQuestionDifficultyRow | undefined | 'loading' | 'error'

interface QuestionTableProps {
  rows: AdminQuestion[]
  places: ReadonlyMap<string, TopicPlace>
  estimates: Estimates
  /** The question just saved, shaded. */
  highlight: string | null
  /** The list's query string, so the editor can come back to it. */
  listSearch: string
  onNotice: (notice: ListNotice, focus?: boolean) => void
}

function QuestionTable({ rows, places, estimates, highlight, listSearch, onNotice }: QuestionTableProps) {
  return (
    <ScrollTable caption="Questions" className="min-w-[68rem]">
      <thead>
        <tr className={labelClass}>
          <th scope="col" className={cx(headClass, 'text-left')}>
            Code
          </th>
          <th scope="col" className={cx(headClass, 'text-left')}>
            Question
          </th>
          <th scope="col" className={cx(headClass, 'text-left')}>
            Exam · topic
          </th>
          <th scope="col" className={cx(headClass, 'text-left')}>
            Difficulty
          </th>
          <th scope="col" className={cx(headClass, 'text-left')}>
            Data says
          </th>
          <th scope="col" className={cx(headClass, 'text-left')}>
            Status
          </th>
          <th scope="col" className={cx(headClass, 'text-right')}>
            Attempts
          </th>
          <th scope="col" className={cx(headClass, 'text-right')}>
            Accuracy
          </th>
          <th scope="col" className={cx(headClass, 'text-right')}>
            Reports
          </th>
          <th scope="col" className={cx(pinnedHeadClass, 'text-right')}>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((q) => (
          <QuestionRow
            key={q.id}
            question={q}
            place={places.get(q.topic_id)}
            estimate={typeof estimates === 'string' ? estimates : estimates.get(q.id)}
            highlighted={q.id === highlight}
            listSearch={listSearch}
            onNotice={onNotice}
          />
        ))}
      </tbody>
    </ScrollTable>
  )
}

type RowState =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'confirm' }
  /** `refused`: the database kept the question because learners attempted it. */
  | { kind: 'error'; message: string; refused: boolean }

interface QuestionRowProps {
  question: AdminQuestion
  place: TopicPlace | undefined
  estimate: Estimate
  highlighted: boolean
  listSearch: string
  onNotice: (notice: ListNotice, focus?: boolean) => void
}

function QuestionRow({ question, place, estimate, highlighted, listSearch, onNotice }: QuestionRowProps) {
  const [row, setRow] = useState<RowState>({ kind: 'idle' })
  const actionsRef = useRef<HTMLDivElement>(null)
  const noteId = useId()
  const { code } = question
  const published = question.status === 'published'
  const publishable = canPublish(question)
  const busy = row.kind === 'busy'

  /** Puts focus back on one of the row's buttons once React has rendered them. */
  const focusAction = (name: 'status' | 'delete') =>
    requestAnimationFrame(() => actionsRef.current?.querySelector<HTMLElement>(`[data-action="${name}"]`)?.focus())

  async function changeStatus(next: QuestionStatus) {
    setRow({ kind: 'busy', label: next === 'published' ? 'Publishing…' : 'Unpublishing…' })
    const result = await setQuestionStatus(question.id, next)
    if (result.error !== undefined) {
      setRow({ kind: 'error', message: result.error, refused: false })
      return
    }
    setRow({ kind: 'idle' })
    onNotice({
      tone: 'ok',
      text: next === 'published' ? `${code} published.` : `${code} unpublished. Learners no longer see it.`,
    })
    focusAction('status')
  }

  async function remove() {
    setRow({ kind: 'busy', label: 'Deleting…' })
    const result = await deleteQuestion(question.id)
    if (result.error === null) {
      // The row is gone, so focus moves to the message.
      onNotice({ tone: 'ok', text: `${code} deleted.` }, true)
      return
    }
    setRow({ kind: 'error', message: result.error, refused: result.hasAttempts })
  }

  function cancel(focus: 'status' | 'delete' = 'delete') {
    setRow({ kind: 'idle' })
    focusAction(focus)
  }

  return (
    <tr id={rowId(question.id)} className={cx('border-t border-ink/10', highlighted && 'bg-pen/5')}>
      <th
        scope="row"
        className={cx(
          cellClass,
          'whitespace-nowrap text-left font-mono font-medium',
          highlighted && 'shadow-[inset_3px_0_0_var(--color-pen)]',
        )}
      >
        {code}
      </th>
      <td className={cx(cellClass, 'min-w-56 max-w-80')}>
        <p className="line-clamp-2 break-words">{firstLine(question.body)}</p>
      </td>
      <td className={cx(cellClass, 'min-w-40 text-ink/70')}>
        {place ? (
          <>
            {place.exam.name} · {place.topic.name}
          </>
        ) : (
          'Unknown topic'
        )}
      </td>
      <td className={cx(cellClass, 'capitalize')}>{question.difficulty}</td>
      <DataSaysCell estimate={estimate} />
      <td className={cellClass}>
        <StatusPill status={question.status} />
      </td>
      <td className={cx(cellClass, 'text-right font-mono tabular-nums')}>{question.attempts}</td>
      <td
        className={cx(cellClass, 'text-right font-mono tabular-nums')}
        title={question.answered > 0 ? `${question.correct} of ${question.answered} correct` : undefined}
      >
        <Percent value={accuracyPercent(question)} />
      </td>
      <td
        className={cx(
          cellClass,
          'text-right font-mono tabular-nums',
          question.open_reports > 0 && 'font-bold text-bad',
        )}
      >
        {question.open_reports}
      </td>
      {/* Pinned, so the actions stay in view however far the table scrolls. */}
      <td className={cx(cellClass, pinnedClass, highlighted ? pinnedHighlightClass : 'bg-sheet', 'text-right')}>
        <div ref={actionsRef}>
          {row.kind === 'confirm' ? (
            <div role="group" aria-label={`Delete ${code}?`} className="ml-auto flex w-44 flex-col items-end gap-2 sm:w-60">
              <p className="text-left">Delete {code}? This can't be undone.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" autoFocus onClick={() => cancel()}>
                  Cancel
                </Button>
                <Button size="sm" variant="danger" onClick={remove}>
                  Delete
                </Button>
              </div>
            </div>
          ) : row.kind === 'error' ? (
            <div className="ml-auto flex w-44 flex-col items-end gap-2 sm:w-64">
              <div role="alert" className="flex flex-col gap-1 text-left">
                <p className="text-bad">{row.message}</p>
                {row.refused && !published && (
                  <p className="text-ink/70">It's already unpublished, so learners don't see it.</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  autoFocus={!(row.refused && published)}
                  onClick={() => cancel('status')}
                >
                  Dismiss
                </Button>
                {row.refused && published && (
                  <Button size="sm" autoFocus onClick={() => changeStatus('draft')}>
                    Unpublish
                  </Button>
                )}
              </div>
            </div>
          ) : (
            // Stacked on narrow screens, so the pinned column leaves room for the rest.
            <div className="ml-auto flex w-28 flex-col gap-1 sm:w-auto sm:items-end">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:justify-end">
                <ButtonLink
                  to={{ search: `?tab=edit&id=${question.id}` }}
                  state={{ list: listSearch }}
                  variant="secondary"
                  size="sm"
                  aria-label={`Edit ${code}`}
                >
                  Edit
                </ButtonLink>
                <Button
                  size="sm"
                  variant="secondary"
                  data-action="status"
                  disabled={busy || (!published && !publishable)}
                  aria-describedby={!published && !publishable ? noteId : undefined}
                  aria-label={`${published ? 'Unpublish' : 'Publish'} ${code}`}
                  onClick={() => changeStatus(published ? 'draft' : 'published')}
                >
                  {published ? 'Unpublish' : 'Publish'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  data-action="delete"
                  disabled={busy}
                  aria-label={`Delete ${code}`}
                  onClick={() => setRow({ kind: 'confirm' })}
                >
                  Delete
                </Button>
              </div>
              {busy ? (
                <p role="status" className="text-xs text-ink/60">
                  {row.label}
                </p>
              ) : (
                !published &&
                !publishable && (
                  <p id={noteId} className="text-xs text-ink/60">
                    Add an explanation to publish
                  </p>
                )
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

/** The level learners' first answers give the question, or a dash until it has enough of them. */
function DataSaysCell({ estimate }: { estimate: Estimate }) {
  if (estimate === 'loading') {
    return (
      <td className={cellClass}>
        <Skeleton className="h-4 w-24" />
      </td>
    )
  }
  const loaded = estimate === 'error' ? undefined : estimate
  // A level is only ever stored with its p_average.
  if (loaded?.estimated_level && loaded.p_average !== null) {
    return (
      <td
        className={cx(cellClass, 'whitespace-nowrap')}
        title={`An average learner gets it right ${Math.round(loaded.p_average * 100)}% of the time`}
      >
        {dataSaysLabel(loaded)}
      </td>
    )
  }
  // A failed load is explained above the table.
  const note = estimate === 'error' ? 'Not loaded' : needsAnswersNote(loaded?.responses)
  return (
    <td className={cellClass} title={estimate === 'error' ? undefined : note}>
      <span aria-hidden>—</span>
      <span className="sr-only">{note}</span>
    </td>
  )
}

export function QuestionListSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <LoadingLabel>Loading the questions…</LoadingLabel>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-11" />
          </div>
        ))}
      </div>
      <Skeleton className="h-4 w-32" />
      <Card className="px-0 py-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-t border-ink/10 px-5 py-3 first:border-t-0">
            <Skeleton className="h-4 w-12 shrink-0" />
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="ml-auto h-8 w-40 shrink-0" />
          </div>
        ))}
      </Card>
    </div>
  )
}
