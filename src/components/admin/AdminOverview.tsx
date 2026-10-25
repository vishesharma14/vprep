import { useId, type ReactNode } from 'react'
import { useQuestionDifficulty } from '../../hooks/useAdminDifficulty'
import { useEmbeddingStatus } from '../../hooks/useAdminEmbeddings'
import type { AdminQuestion } from '../../hooks/useAdminQuestions'
import { topicPlaces, type CatalogExam } from '../../hooks/useExamCatalog'
import { cx } from '../../lib/cx'
import {
  difficultySummary,
  FIT_DIFFICULTY_COMMAND,
  LEVEL_LABEL,
  levelTable,
  LEVELS,
  MIN_FIRST_ANSWERS,
  mismatches,
  type LevelTable,
  type Mismatch,
} from '../../lib/difficulty'
import { firstLine, formatDate, plural } from '../../lib/format'
import { canPublish } from '../../lib/questions'
import { EMBED_COMMAND, embeddingCoverage } from '../../lib/similar'
import type { AdminQuestionDifficultyRow, EmbeddingStatus } from '../../types'
import { Percent } from '../progress/Percent'
import { ButtonLink } from '../ui/Button'
import { Card } from '../ui/Card'
import { LoadError } from '../ui/LoadError'
import { ProgressBar } from '../ui/ProgressBar'
import { LoadingLabel, Skeleton } from '../ui/Skeleton'
import { Pill } from './StatusPill'

const labelClass = 'font-mono text-[0.6875rem] font-medium uppercase tracking-widest text-drop'

const statGridClass = 'grid grid-cols-2 gap-3 sm:grid-cols-3'

const sum = <T,>(items: T[], count: (item: T) => number) => items.reduce((total, item) => total + count(item), 0)

interface AdminOverviewProps {
  exams: CatalogExam[]
  questions: AdminQuestion[]
}

/** Content at a glance: counts, explanation and embedding coverage, the difficulty check, and questions per exam. */
export function AdminOverview({ exams, questions }: AdminOverviewProps) {
  const count = (status: AdminQuestion['status']) => questions.filter((q) => q.status === status).length
  const openReports = sum(questions, (q) => q.open_reports)
  const explained = questions.filter(canPublish).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <ButtonLink to={{ search: '?tab=edit' }}>Add question</ButtonLink>
        <ButtonLink to={{ search: '?tab=reports' }} variant="secondary">
          Review reports ({openReports})
        </ButtonLink>
      </div>

      <dl className={statGridClass}>
        <Stat label="Published" value={count('published')} />
        <Stat label="In review" value={count('in_review')} />
        <Stat label="Drafts" value={count('draft')} />
        <Stat label="Exams" value={exams.length} />
        <Stat label="Topics" value={sum(exams, (e) => e.topic_count)} />
        <Stat label="Open reports" value={openReports} />
      </dl>

      <Section title="Explanation coverage">
        <p className="font-display text-3xl font-bold">
          <Percent value={questions.length > 0 ? Math.round((explained / questions.length) * 100) : null} />
        </p>
        <ProgressBar value={explained} max={questions.length} />
        <p className="text-sm text-ink/70">
          {explained} of {plural(questions.length, 'question')} {explained === 1 ? 'has' : 'have'} an explanation. A
          question needs one to be published.
        </p>
      </Section>

      <EmbeddingCoverage />

      <DifficultyCheck />

      <QuestionsPerExam exams={exams} questions={questions} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="flex flex-col gap-1">
      <dt className={labelClass}>{label}</dt>
      <dd className="font-display text-2xl font-bold tabular-nums">{value}</dd>
    </Card>
  )
}

/** A card with a heading, labelling the section around it. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId}>
      <Card className="flex flex-col gap-4">
        <h2 id={headingId} className="text-lg font-bold">
          {title}
        </h2>
        {children}
      </Card>
    </section>
  )
}

/** A script in ml/ to run, and how. `lead` comes first, as a sentence. */
function RunCommand({ lead, command }: { lead: ReactNode; command: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        {lead} Run this from the project folder with <code className="font-mono">ml/.venv</code> active, then reload:
      </p>
      <pre className="overflow-x-auto rounded-lg bg-ink/5 px-3 py-2 font-mono text-sm">
        <code>{command}</code>
      </pre>
    </div>
  )
}

/** How many questions have an embedding for similar questions. Loads its own data. */
function EmbeddingCoverage() {
  const status = useEmbeddingStatus()
  return (
    <Section title="Embedding coverage">
      {status.status === 'loading' ? (
        <>
          <LoadingLabel>Loading embedding coverage…</LoadingLabel>
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-1.5 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </>
      ) : status.status === 'error' ? (
        <LoadError message={`Couldn't load the embedding coverage. ${status.error}`} onRetry={status.retry} />
      ) : (
        <CoverageDetails status={status.data} />
      )}
    </Section>
  )
}

function CoverageDetails({ status }: { status: EmbeddingStatus }) {
  const { upToDate, percent, needsRun } = embeddingCoverage(status)
  const behind = [
    status.missing > 0 && `${plural(status.missing, 'question')} ${status.missing === 1 ? 'has' : 'have'} none`,
    status.stale > 0 && `${plural(status.stale, 'question')} changed after being embedded`,
  ].filter(Boolean)

  return (
    <>
      <p className="font-display text-3xl font-bold">
        <Percent value={percent} />
      </p>
      <ProgressBar value={upToDate} max={status.questions} />
      <p className="break-words text-sm text-ink/70">
        {upToDate} of {plural(status.questions, 'question')} {upToDate === 1 ? 'has' : 'have'} an up-to-date
        embedding{status.model && <>, from <span className="font-mono">{status.model}</span></>}. Similar questions
        are found from these.
      </p>
      {needsRun ? (
        <RunCommand lead={`${behind.join(' and ')}.`} command={EMBED_COMMAND} />
      ) : (
        <p className="text-sm text-ok">Every question is up to date.</p>
      )}
    </>
  )
}

/** The level set on each question against the one learners' first answers give it. Loads its own data. */
function DifficultyCheck() {
  const difficulty = useQuestionDifficulty()
  return (
    <Section title="Difficulty check">
      {difficulty.status === 'loading' ? (
        <>
          <LoadingLabel>Loading the difficulty check…</LoadingLabel>
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </>
      ) : difficulty.status === 'error' ? (
        <LoadError message={`Couldn't load the difficulty check. ${difficulty.error}`} onRetry={difficulty.retry} />
      ) : (
        <DifficultyDetails rows={difficulty.data} />
      )}
    </Section>
  )
}

/** Mismatches listed, biggest first. */
const MISMATCHES_SHOWN = 5

const REFIT_LEAD = 'The estimates only change when the fit runs again.'

function DifficultyDetails({ rows }: { rows: AdminQuestionDifficultyRow[] }) {
  const { fitted, withLevel, firstAnswers, fittedAt } = difficultySummary(rows)
  const lastFit = fittedAt
    ? `Last fitted ${formatDate(fittedAt)}, from ${plural(firstAnswers, 'first answer')} to ${plural(fitted, 'question')}.`
    : 'Not fitted yet.'

  if (withLevel === 0) {
    return (
      <>
        <p className="text-sm text-ink/70">
          The data says how hard each question really is from learners' first answers to it: their first try, before
          they've seen the answer. A question needs {MIN_FIRST_ANSWERS} first answers to get a level, and none has that
          many yet. {lastFit}
        </p>
        <RunCommand lead={REFIT_LEAD} command={FIT_DIFFICULTY_COMMAND} />
      </>
    )
  }

  const found = mismatches(rows)
  return (
    <>
      <p className="font-display text-3xl font-bold tabular-nums">
        {found.length}
        <span className="ml-2 text-base font-medium text-ink/70">{found.length === 1 ? 'mismatch' : 'mismatches'}</span>
      </p>
      <p className="text-sm text-ink/70">
        {found.length} of {plural(withLevel, 'question')} with a level from learners' first answers{' '}
        {found.length === 1 ? 'has' : 'have'} a different level set. A question gets one at {MIN_FIRST_ANSWERS} first
        answers. {lastFit}
      </p>
      <LevelCrosstab table={levelTable(rows)} />
      {found.length > 0 && <MismatchList mismatches={found.slice(0, MISMATCHES_SHOWN)} />}
      <RunCommand lead={REFIT_LEAD} command={FIT_DIFFICULTY_COMMAND} />
    </>
  )
}

const crossCellClass = 'px-3 py-2 text-right first:pl-0 last:pr-0'

/** Questions by the level set (rows) and the level the data gives (columns). */
function LevelCrosstab({ table }: { table: LevelTable }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[24rem] text-sm">
        <caption className="sr-only">Questions by the level set and the level learners' first answers give</caption>
        <colgroup>
          <col />
        </colgroup>
        <colgroup span={LEVELS.length} />
        <colgroup>
          <col />
        </colgroup>
        <thead className={labelClass}>
          <tr>
            <td />
            <th scope="colgroup" colSpan={LEVELS.length} className="px-3 pb-1 text-center font-medium">
              Data says
            </th>
            <td />
          </tr>
          <tr>
            <th scope="col" className={cx(crossCellClass, 'text-left font-medium')}>
              Set
            </th>
            {LEVELS.map((level) => (
              <th key={level} scope="col" className={cx(crossCellClass, 'font-medium')}>
                {LEVEL_LABEL[level]}
              </th>
            ))}
            <th scope="col" className={cx(crossCellClass, 'font-medium')}>
              No level yet
            </th>
          </tr>
        </thead>
        <tbody>
          {LEVELS.map((set) => (
            <tr key={set} className="border-t border-ink/10">
              <th scope="row" className={cx(crossCellClass, 'text-left font-medium')}>
                {LEVEL_LABEL[set]}
              </th>
              {LEVELS.map((estimated) => {
                const count = table[set][estimated]
                return (
                  <td
                    key={estimated}
                    className={cx(
                      crossCellClass,
                      'font-mono tabular-nums',
                      estimated === set ? 'text-ok' : count > 0 ? 'font-bold text-bad' : 'text-ink/60',
                    )}
                  >
                    {count}
                  </td>
                )
              })}
              <td className={cx(crossCellClass, 'font-mono tabular-nums text-ink/60')}>{table[set].none}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const percentOf = (share: number | null) => Math.round((share ?? 0) * 100)

function MismatchList({ mismatches }: { mismatches: Mismatch[] }) {
  const headingId = useId()
  return (
    <div className="flex flex-col gap-2">
      <h3 id={headingId} className="font-bold">
        Biggest mismatches
      </h3>
      <ul aria-labelledby={headingId} className="flex flex-col">
        {mismatches.map(({ row, estimated, gap }) => (
          <li
            key={row.question_id}
            className="flex items-start gap-3 border-t border-ink/10 py-3 first:border-t-0 first:pt-0 last:pb-0"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="font-mono text-sm font-medium">{row.code}</span>
                <Pill tone={gap > 1 ? 'bad' : 'warn'}>
                  Set {row.set_level}, data says {estimated}
                </Pill>
              </div>
              <p className="line-clamp-2 break-words text-sm">{firstLine(row.body)}</p>
              <p className="text-xs text-ink/60">
                {row.exam_name} · {row.topic_name} · {plural(row.responses ?? 0, 'first answer')},{' '}
                {percentOf(row.correct_rate)}% right · an average learner gets it right {percentOf(row.p_average)}% of
                the time
              </p>
            </div>
            <ButtonLink
              to={{ search: `?tab=edit&id=${row.question_id}` }}
              variant="secondary"
              size="sm"
              aria-label={`Edit ${row.code}`}
              className="shrink-0"
            >
              Edit
            </ButtonLink>
          </li>
        ))}
      </ul>
    </div>
  )
}

function QuestionsPerExam({ exams, questions }: AdminOverviewProps) {
  const places = topicPlaces(exams)
  const rows = exams.map((exam) => {
    const inExam = questions.filter((q) => places.get(q.topic_id)?.exam.id === exam.id)
    return { exam, total: inExam.length, published: inExam.filter((q) => q.status === 'published').length }
  })
  const max = Math.max(0, ...rows.map((row) => row.total))

  return (
    <Section title="Questions per exam">
      {rows.length === 0 ? (
        <p className="text-ink/70">No exams yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map(({ exam, total, published }) => (
            <li
              key={exam.id}
              className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_3rem]"
            >
              <p className="col-span-2 break-words text-sm sm:col-span-1">
                <span className="font-bold">{exam.name}</span>
                <span className="text-ink/60"> · {published} published</span>
              </p>
              <ProgressBar value={total} max={max} />
              <p className="text-right font-mono text-sm font-medium tabular-nums">
                {total}
                <span className="sr-only"> {total === 1 ? 'question' : 'questions'}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

export function AdminOverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingLabel>Loading the overview…</LoadingLabel>
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-11 w-36" />
        <Skeleton className="h-11 w-48" />
      </div>
      <div className={statGridClass}>
        {Array.from({ length: 6 }, (_, i) => (
          <Card key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-12" />
          </Card>
        ))}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="flex flex-col gap-4">
          <Skeleton className="h-6 w-48" />
          {Array.from({ length: 3 }, (_, j) => (
            <Skeleton key={j} className={cx('h-4', j === 0 ? 'w-24' : 'w-full')} />
          ))}
        </Card>
      ))}
    </div>
  )
}
