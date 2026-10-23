import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { QuestionCard } from '../components/practice/QuestionCard'
import { Button, ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ChoiceChips } from '../components/ui/ChoiceChips'
import { SelectField, TextField } from '../components/ui/Field'
import { Highlight } from '../components/ui/Highlight'
import { LoadError } from '../components/ui/LoadError'
import { Skeleton } from '../components/ui/Skeleton'
import type { AsyncResult } from '../hooks/useAsync'
import { useExamCatalog, type CatalogExam } from '../hooks/useExamCatalog'
import { SEARCH_LIMIT, useSearchQuestions, type QuestionSearch } from '../hooks/useSearchQuestions'
import { cx } from '../lib/cx'
import { firstLine, plural } from '../lib/format'
import { searchWords } from '../lib/search'
import type { Difficulty, QuestionType, SearchQuestionRow } from '../types'

/** How long typing has to pause before the search runs. */
const DEBOUNCE_MS = 250

const EXAMPLES = ['probability', 'GATE scheduling', 'mole']

const DIFFICULTIES: Array<{ value: Difficulty | ''; label: string }> = [
  { value: '', label: 'Any' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

const TYPES: Array<{ value: QuestionType | ''; label: string }> = [
  { value: '', label: 'Any' },
  { value: 'practice', label: 'Practice' },
  { value: 'pyq', label: 'PYQ' },
]

/** The query string, in this order. */
type Param = 'q' | 'exam' | 'difficulty' | 'type'
const PARAMS: Param[] = ['q', 'exam', 'difficulty', 'type']

// "/" focuses the search box, except while typing in another field.
const TYPING = 'input:not([type="radio"]):not([type="checkbox"]), textarea, select, [contenteditable="true"]'

/** Trimmed, with runs of whitespace collapsed: what goes in ?q=. */
const tidy = (text: string) => text.trim().replace(/\s+/g, ' ')

const chipClass = cx(
  'inline-flex h-9 items-center rounded-full border border-ink/15 bg-sheet px-4 text-sm font-bold text-ink/75',
  'transition-colors hover:border-pen hover:text-pen',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen',
)

export function Search() {
  const [params, setParams] = useSearchParams()
  const catalog = useExamCatalog()
  const inputId = useId()

  const query = tidy(params.get('q') ?? '')
  // Unknown values are ignored, as if the filter were off. Until the catalog
  // loads, any exam is taken at its word.
  const examParam = params.get('exam')
  const exam =
    examParam && (catalog.status !== 'ready' || catalog.data.some((e) => e.slug === examParam)) ? examParam : null
  const difficulty = DIFFICULTIES.find((d) => d.value === params.get('difficulty'))?.value || null
  const type = TYPES.find((t) => t.value === params.get('type'))?.value || null
  const filtered = exam !== null || difficulty !== null || type !== null

  const [text, setText] = useState(query)
  const [seenQuery, setSeenQuery] = useState(query)
  // The address changed without typing (an example, or the Search link in the
  // menu): show its query in the box.
  if (query !== seenQuery) {
    setSeenQuery(query)
    if (tidy(text) !== query) setText(query)
  }

  /** Changes some of the query string, keeping the rest. Replaces the history entry, so Back leaves the page. */
  const update = useCallback(
    (changes: Partial<Record<Param, string | null>>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams()
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
    const next = tidy(text)
    if (next === query) return
    const timer = setTimeout(() => update({ q: next }), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text, query, update])

  const focusSearch = useCallback(() => {
    const input = document.getElementById(inputId)
    if (input instanceof HTMLInputElement) {
      input.focus()
      input.select()
    }
  }, [inputId])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== '/' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      if (e.target instanceof Element && e.target.closest(TYPING)) return
      e.preventDefault()
      focusSearch()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focusSearch])

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Enter searches straight away.
    update({ q: tidy(text) })
  }

  function tryExample(example: string) {
    setText(example)
    update({ q: example })
    focusSearch()
  }

  function clearFilters() {
    update({ exam: null, difficulty: null, type: null })
    focusSearch()
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="Search" />
      <form role="search" noValidate onSubmit={submit} className="flex flex-col gap-5">
        <TextField
          id={inputId}
          label="Search questions"
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="A word, topic, exam or year"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        <div className="flex flex-wrap gap-x-6 gap-y-4">
          <ExamFilter catalog={catalog} value={exam} onChange={(slug) => update({ exam: slug })} />
          <ChoiceChips
            legend="Difficulty"
            options={DIFFICULTIES}
            value={difficulty ?? ''}
            onChange={(value) => update({ difficulty: value || null })}
          />
          <ChoiceChips
            legend="Type"
            options={TYPES}
            value={type ?? ''}
            onChange={(value) => update({ type: value || null })}
          />
        </div>
        <p className="hidden font-mono text-xs text-ink/50 md:block">Press / to jump back to the search box</p>
      </form>

      <div className="mt-8">
        {query || filtered ? (
          <Results search={{ query, exam, difficulty, type }} filtered={filtered} onClearFilters={clearFilters} />
        ) : (
          <Intro onExample={tryExample} />
        )}
      </div>
    </div>
  )
}

interface ExamFilterProps {
  catalog: AsyncResult<CatalogExam[]>
  value: string | null
  onChange: (slug: string | null) => void
}

function ExamFilter({ catalog, value, onChange }: ExamFilterProps) {
  return (
    <div className="w-full sm:w-64">
      {catalog.status === 'error' ? (
        <LoadError message={`Couldn't load the exams. ${catalog.error}`} onRetry={catalog.retry} />
      ) : (
        <SelectField
          label="Exam"
          value={value ?? ''}
          disabled={catalog.status === 'loading'}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">Any exam</option>
          {catalog.status === 'ready'
            ? catalog.data.map((exam) => (
                <option key={exam.id} value={exam.slug}>
                  {exam.name}
                </option>
              ))
            : value && <option value={value}>Loading…</option>}
        </SelectField>
      )}
    </div>
  )
}

function Intro({ onExample }: { onExample: (example: string) => void }) {
  const labelId = useId()
  return (
    <Card className="flex flex-col gap-4">
      <p>Search by keyword, topic, exam or year.</p>
      <div>
        <p id={labelId} className="mb-2 text-sm font-bold text-ink/70">
          Try
        </p>
        <ul aria-labelledby={labelId} className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <li key={example}>
              <button type="button" onClick={() => onExample(example)} className={chipClass}>
                {example}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

interface ResultsProps {
  search: QuestionSearch
  /** True when an exam, difficulty or type is chosen. */
  filtered: boolean
  onClearFilters: () => void
}

function Results({ search, filtered, onClearFilters }: ResultsProps) {
  const results = useSearchQuestions(search)
  // While the next search runs, the last results stay up, dimmed.
  const [last, setLast] = useState<{ search: QuestionSearch; rows: SearchQuestionRow[] } | null>(null)
  if (results.status === 'ready' && last?.rows !== results.data) setLast({ search, rows: results.data })

  const shown = results.status === 'ready' ? { search, rows: results.data } : last
  const loading = results.status === 'loading'

  let announcement = 'Searching…'
  if (results.status === 'error') announcement = ''
  else if (!loading && shown) {
    announcement = shown.rows.length === 0 ? 'No questions match.' : plural(shown.rows.length, 'question')
  }

  return (
    <>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {results.status === 'error' ? (
        <LoadError message={`Couldn't search the questions. ${results.error}`} onRetry={results.retry} />
      ) : !shown ? (
        <ResultsSkeleton />
      ) : (
        <div aria-busy={loading} className={cx('transition-opacity', loading && 'opacity-60')}>
          {shown.rows.length === 0 ? (
            <NoResults filtered={filtered} onClearFilters={onClearFilters} />
          ) : (
            <ResultList rows={shown.rows} words={searchWords(shown.search.query)} />
          )}
        </div>
      )}
    </>
  )
}

function ResultList({ rows, words }: { rows: SearchQuestionRow[]; words: string[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{plural(rows.length, 'question')}</h2>
        <ButtonLink to={`/practice?ids=${rows.map((row) => row.id).join(',')}`}>
          {rows.length === 1 ? 'Practise this question' : `Practise these ${rows.length}`}
        </ButtonLink>
      </div>
      {rows.length >= SEARCH_LIMIT && (
        <p className="text-sm text-ink/70">
          Showing the first {SEARCH_LIMIT}. Add a word or a filter to narrow it down.
        </p>
      )}
      <ul aria-label="Search results" className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.id}>
            <QuestionCard
              code={row.code}
              exam={row.exam_name}
              topic={row.topic_name}
              difficulty={row.difficulty}
              pyqYear={row.type === 'pyq' ? row.year : null}
              preview={<Highlight text={firstLine(row.body)} words={words} />}
            >
              <div className="flex justify-end">
                <ButtonLink
                  to={`/practice?q=${row.id}`}
                  variant="secondary"
                  size="sm"
                  aria-label={`Attempt ${row.code}`}
                >
                  Attempt
                </ButtonLink>
              </div>
            </QuestionCard>
          </li>
        ))}
      </ul>
    </div>
  )
}

function NoResults({ filtered, onClearFilters }: { filtered: boolean; onClearFilters: () => void }) {
  // "Clear filters" only shows when there is a filter to clear.
  return (
    <Card className="flex flex-col items-start gap-4">
      <p>
        {filtered
          ? 'No questions match. Try a broader word, or clear a filter.'
          : 'No questions match. Try a broader word.'}
      </p>
      {filtered && (
        <Button variant="secondary" size="sm" onClick={onClearFilters}>
          Clear filters
        </Button>
      )}
    </Card>
  )
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-11 w-44" />
      </div>
      <ul className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i}>
            <Card className="flex flex-col gap-3">
              <Skeleton className="h-4 w-56 max-w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="ml-auto h-8 w-24" />
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
