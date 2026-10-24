import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { importQuestions, type AdminQuestion } from '../../hooks/useAdminQuestions'
import { useAsync } from '../../hooks/useAsync'
import type { CatalogExam } from '../../hooks/useExamCatalog'
import { cx } from '../../lib/cx'
import { firstLine, plural } from '../../lib/format'
import { fetchFormulas } from '../../lib/formulas'
import {
  checkImport,
  downloadCsv,
  MAX_IMPORT_ROWS,
  readQuestionCsv,
  TEMPLATE_FILE_NAME,
  templateCsv,
  type ImportRow,
} from '../../lib/questionCsv'
import { MAX_OPTIONS, MIN_OPTIONS, YEAR_MAX, YEAR_MIN } from '../../lib/questions'
import type { Formula } from '../../types'
import { Button, ButtonLink } from '../ui/Button'
import { Card } from '../ui/Card'
import { Disclosure } from '../ui/Disclosure'
import { LoadError } from '../ui/LoadError'
import { Notice } from '../ui/Notice'
import { LoadingLabel, Skeleton } from '../ui/Skeleton'
import { listSearchOf } from './listSearch'
import type { SavedNotice } from './QuestionList'
import { ScrollTable } from './ScrollTable'
import { StatusPill } from './StatusPill'
import { cellClass, headClass, labelClass } from './table'

/** Q999 before Q1000. */
const byCode = new Intl.Collator('en', { numeric: true }).compare

/** What goes in each column, for the guide under the template button. */
const COLUMN_GUIDE: Array<{ columns: string; text: string }> = [
  {
    columns: 'exam, subject, topic',
    text: "The slug or exact name of an existing exam, subject and topic. Case doesn't matter.",
  },
  { columns: 'subtopic, source, hint', text: 'Optional.' },
  { columns: 'difficulty', text: 'easy, medium or hard. Blank means medium.' },
  { columns: 'type', text: 'practice or pyq. Blank means practice.' },
  { columns: 'year', text: `The year a PYQ was asked, ${YEAR_MIN}–${YEAR_MAX}. Needed for pyq, and only for pyq.` },
  { columns: 'question', text: 'The question. Line breaks are kept.' },
  {
    columns: 'option_a … option_f',
    text: `${MIN_OPTIONS} to ${MAX_OPTIONS} options, filled in from option_a with no gaps. Leave the rest blank.`,
  },
  { columns: 'answer', text: 'The letter of the correct option: A, B, C…' },
  { columns: 'explanation', text: 'Needed to publish.' },
  { columns: 'formula', text: "Optional. A formula's slug, as on the Formulas tab." },
  { columns: 'tags', text: 'Optional. Separate them with semicolons: discount; markup' },
  { columns: 'status', text: 'draft, in_review or published. Blank means draft.' },
  { columns: 'code', text: 'Only in exported files. Ignored on import: each new question gets the next code.' },
]

type FileState =
  | { kind: 'none' }
  | { kind: 'reading'; name: string }
  | { kind: 'error'; name: string; error: string }
  /** Checked as the file is read, against the questions saved then. */
  | { kind: 'ready'; name: string; rows: ImportRow[] }

interface QuestionImportProps {
  exams: CatalogExam[]
  questions: AdminQuestion[]
}

/** Adds questions from a CSV file, after a preview that shows what is wrong with each row. */
export function QuestionImport({ exams, questions }: QuestionImportProps) {
  // Rows name formulas by slug.
  const formulas = useAsync(fetchFormulas)
  if (formulas.status === 'error') {
    return <LoadError message={`Couldn't load the formulas. ${formulas.error}`} onRetry={formulas.retry} />
  }
  if (formulas.status === 'loading') return <QuestionImportSkeleton />
  return <Importer exams={exams} questions={questions} formulas={formulas.data} />
}

interface ImporterProps extends QuestionImportProps {
  formulas: Formula[]
}

function Importer({ exams, questions, formulas }: ImporterProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const listSearch = listSearchOf(location.state)
  const [file, setFile] = useState<FileState>({ kind: 'none' })
  const [dragging, setDragging] = useState(false)
  const [onlyErrors, setOnlyErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Bumped per file chosen, so a slow read of an earlier one is dropped.
  const reads = useRef(0)
  const ids = useId()

  const rows = file.kind === 'ready' ? file.rows : []
  const bad = rows.filter((row) => row.errors.length > 0).length
  const shown = onlyErrors && bad > 0 ? rows.filter((row) => row.errors.length > 0) : rows

  // A file dropped beside the drop zone would otherwise open in the tab, leaving the app.
  useEffect(() => {
    const keep = (e: globalThis.DragEvent) => e.preventDefault()
    window.addEventListener('dragover', keep)
    window.addEventListener('drop', keep)
    return () => {
      window.removeEventListener('dragover', keep)
      window.removeEventListener('drop', keep)
    }
  }, [])

  async function choose(chosen: File | undefined) {
    if (!chosen || saving) return
    const read = ++reads.current
    setSaveError(null)
    setOnlyErrors(false)
    setFile({ kind: 'reading', name: chosen.name })
    const parsed = await readQuestionCsv(chosen)
    if (read !== reads.current) return
    setFile(
      parsed.error !== undefined
        ? { kind: 'error', name: chosen.name, error: parsed.error }
        : { kind: 'ready', name: chosen.name, rows: checkImport(parsed.rows, { exams, formulas, questions }) },
    )
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setDragging(false)
    void choose(e.dataTransfer.files[0])
  }

  async function runImport() {
    const inputs = rows.flatMap((row) => (row.input ? [row.input] : []))
    if (inputs.length === 0 || inputs.length !== rows.length) return
    setSaving(true)
    setSaveError(null)
    const result = await importQuestions(inputs)
    if (result.error !== undefined) {
      setSaveError(`Couldn't import the questions, so none were added. ${result.error}`)
      setSaving(false)
      return
    }
    const codes = result.questions.map((q) => q.code).sort(byCode)
    const first = codes[0]
    const last = codes[codes.length - 1]
    const range = first === undefined ? '' : first === last ? ` (${first})` : ` (${first}–${last})`
    const notice: SavedNotice = { id: null, text: `Imported ${plural(inputs.length, 'question')}${range}` }
    navigate({ search: listSearch }, { replace: true, state: { saved: notice } })
  }

  const statusId = `${ids}-status`

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-2">
        <ButtonLink to={{ search: listSearch }} variant="ghost" size="sm" className="-ml-3">
          ← Back to questions
        </ButtonLink>
        <h2 className="text-2xl font-bold">Import questions</h2>
        <p className="max-w-2xl text-ink/70">
          Add up to {MAX_IMPORT_ROWS} questions at once from a CSV file, one row per question. Every row is checked
          first, and the import adds all of them or none.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Section title="Start from the template">
          <p className="text-ink/70">
            It has the header row and two example rows. Keep the header, and replace the examples with your questions.
          </p>
          <div>
            <Button variant="secondary" onClick={() => downloadCsv(TEMPLATE_FILE_NAME, templateCsv(exams))}>
              Download template
            </Button>
          </div>
          <Disclosure title="What goes in each column">
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
              {COLUMN_GUIDE.map(({ columns, text }) => (
                <div key={columns} className="contents">
                  <dt className="font-mono font-medium">{columns}</dt>
                  <dd className="mb-1 text-ink/70 sm:mb-0">{text}</dd>
                </div>
              ))}
            </dl>
          </Disclosure>
        </Section>

        <Section title="Upload the file">
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={(e) => {
              // Moving onto the text inside counts as leaving too.
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
            }}
            onDrop={onDrop}
            className={cx(
              'flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center',
              'transition-colors',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-pen',
              dragging ? 'border-pen bg-pen/5' : 'border-ink/20 hover:border-pen/60',
              saving && 'pointer-events-none opacity-50',
            )}
          >
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={saving}
              onChange={(e) => {
                void choose(e.target.files?.[0])
                // So choosing the same file again, once fixed, reads it again.
                e.target.value = ''
              }}
            />
            <span className="font-bold">
              Drop a .csv file here, or <span className="text-pen underline">choose one</span>
            </span>
            <span className="text-sm text-ink/60">Up to {MAX_IMPORT_ROWS} questions.</span>
          </label>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink/70">
            <li>In Excel use Save As → CSV UTF-8.</li>
            <li>
              Excel turns values like 1/2 into dates. Type them as '1/2, and check them after opening an exported file.
            </li>
          </ul>
        </Section>
      </div>

      {file.kind === 'reading' && (
        <p role="status" className="text-ink/70">
          Reading {file.name}…
        </p>
      )}
      {file.kind === 'error' && (
        <Notice tone="bad">
          Can't import {file.name}. {file.error}
        </Notice>
      )}
      {file.kind === 'ready' && (
        <section aria-labelledby={`${ids}-preview`} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3 id={`${ids}-preview`} className="text-lg font-bold">
              {file.name}
            </h3>
            <p id={statusId} role="status" className={cx('text-sm', bad > 0 ? 'text-bad' : 'text-ok')}>
              {plural(rows.length, 'question')}.{' '}
              {bad === 0
                ? 'Every row is ready to import.'
                : `${plural(bad, 'row')} ${bad === 1 ? 'has errors' : 'have errors'}. ` +
                  'Fix them in the file, then upload it again.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button
              disabled={saving || bad > 0}
              aria-describedby={bad > 0 ? statusId : undefined}
              onClick={runImport}
            >
              {saving ? 'Importing…' : `Import ${plural(rows.length, 'question')}`}
            </Button>
            {bad > 0 && bad < rows.length && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={onlyErrors}
                  onChange={(e) => setOnlyErrors(e.target.checked)}
                  className="size-4 accent-pen"
                />
                Only rows with errors
              </label>
            )}
          </div>
          {saveError && <Notice tone="bad">{saveError}</Notice>}

          <PreviewTable rows={shown} caption={`Rows in ${file.name}`} />
        </section>
      )}
    </div>
  )
}

/** A card with a heading, labelling the part of the screen inside it. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId}>
      <Card className="flex flex-col gap-4">
        <h3 id={headingId} className="text-lg font-bold">
          {title}
        </h3>
        {children}
      </Card>
    </section>
  )
}

const orDash = (text: string) => text.trim() || '—'

function PreviewTable({ rows, caption }: { rows: ImportRow[]; caption: string }) {
  return (
    <ScrollTable caption={caption} className="min-w-[56rem]">
      <thead>
        <tr className={labelClass}>
          <th scope="col" className={cx(headClass, 'text-right')}>
            Row
          </th>
          <th scope="col" className={cx(headClass, 'text-left')}>
            Exam · subject · topic
          </th>
          <th scope="col" className={cx(headClass, 'text-left')}>
            Question
          </th>
          <th scope="col" className={cx(headClass, 'text-left')}>
            Answer
          </th>
          <th scope="col" className={cx(headClass, 'text-left')}>
            Status
          </th>
          <th scope="col" className={cx(headClass, 'text-left')}>
            Errors
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <PreviewRow key={row.row} row={row} />
        ))}
      </tbody>
    </ScrollTable>
  )
}

function PreviewRow({ row }: { row: ImportRow }) {
  const { cells, errors } = row
  const failed = errors.length > 0
  // Names once found; the file's own words for the rest.
  const place = [
    row.exam?.name ?? orDash(cells.exam),
    row.subject?.name ?? orDash(cells.subject),
    row.topic?.name ?? orDash(cells.topic),
  ].join(' · ')

  return (
    <tr className={cx('border-t border-ink/10', failed && 'bg-bad/5')}>
      <th
        scope="row"
        className={cx(
          cellClass,
          'whitespace-nowrap text-right font-mono font-medium tabular-nums',
          failed && 'shadow-[inset_3px_0_0_var(--color-bad)]',
        )}
      >
        {row.row}
      </th>
      <td className={cx(cellClass, 'min-w-40 max-w-56 break-words text-ink/70')}>{place}</td>
      <td className={cx(cellClass, 'min-w-56 max-w-80')}>
        <p className="line-clamp-2 break-words">{orDash(firstLine(cells.question))}</p>
      </td>
      <td className={cx(cellClass, 'font-mono')}>{orDash(cells.answer.toUpperCase())}</td>
      <td className={cellClass}>
        {row.status ? <StatusPill status={row.status} /> : <span className="break-words">{cells.status}</span>}
      </td>
      <td className={cx(cellClass, 'min-w-64 max-w-md')}>
        {failed ? (
          <ul className="flex flex-col gap-1 text-bad">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : (
          <span className="text-ok">Ready</span>
        )}
      </td>
    </tr>
  )
}

export function QuestionImportSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingLabel>Loading the import…</LoadingLabel>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i} className="flex flex-col gap-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className={i === 0 ? 'h-11 w-44' : 'h-28'} />
          </Card>
        ))}
      </div>
    </div>
  )
}
