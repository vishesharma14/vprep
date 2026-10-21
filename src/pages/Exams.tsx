import { Link, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Card, CardLink } from '../components/ui/Card'
import { LoadError } from '../components/ui/LoadError'
import { ProgressBar } from '../components/ui/ProgressBar'
import { LoadingLabel, Skeleton } from '../components/ui/Skeleton'
import { Tag } from '../components/ui/Tag'
import { examTopics, useExamCatalog, type CatalogExam } from '../hooks/useExamCatalog'
import { progressTotals, useTopicProgress, type ProgressByTopic } from '../hooks/useTopicProgress'
import { CATEGORIES, categoryLabel, isExamCategory } from '../lib/categories'
import { cx } from '../lib/cx'
import { plural } from '../lib/format'
import type { ExamCategory } from '../types'

// Exams being prepared; not in the database yet.
const PLANNED = ['UPSC CSE', 'IBPS PO', 'RRB NTPC', 'CAT', 'CUET UG', 'AWS Cloud Practitioner']

const gridClass = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'

export function Exams() {
  const catalog = useExamCatalog()
  const progress = useTopicProgress()
  const [params] = useSearchParams()
  const param = params.get('category')
  // An unknown ?category= shows everything.
  const category = isExamCategory(param) ? param : null

  return (
    <>
      <PageHeader title="Exams" />
      <CategoryChips selected={category} />

      <div className="mt-6">
        {catalog.status === 'error' ? (
          <LoadError message={`Couldn't load the exams. ${catalog.error}`} onRetry={catalog.retry} />
        ) : catalog.status === 'loading' || progress.status === 'loading' ? (
          <ExamGridSkeleton />
        ) : (
          <>
            {progress.status === 'error' && (
              <div className="mb-6">
                <LoadError message={`Couldn't load your progress. ${progress.error}`} onRetry={progress.retry} />
              </div>
            )}
            <ExamGrid
              exams={category ? catalog.data.filter((e) => e.category === category) : catalog.data}
              progress={progress.status === 'ready' && progress.signedIn ? progress.data : undefined}
            />
          </>
        )}
      </div>

      <PlannedNext />
    </>
  )
}

const CHIPS: Array<{ id: ExamCategory | null; label: string }> = [{ id: null, label: 'All' }, ...CATEGORIES]

function CategoryChips({ selected }: { selected: ExamCategory | null }) {
  return (
    <nav aria-label="Exam categories">
      <ul className="flex flex-wrap gap-2">
        {CHIPS.map(({ id, label }) => {
          const active = id === selected
          return (
            <li key={label}>
              <Link
                to={id ? `/exams?category=${id}` : '/exams'}
                replace
                aria-current={active ? 'true' : undefined}
                className={cx(
                  'inline-flex h-9 items-center rounded-full border px-4 text-sm font-bold transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen',
                  active
                    ? 'border-pen bg-pen text-sheet'
                    : 'border-ink/15 bg-sheet text-ink/75 hover:border-pen hover:text-pen',
                )}
              >
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function ExamGrid({ exams, progress }: { exams: CatalogExam[]; progress?: ProgressByTopic }) {
  if (exams.length === 0) return <p className="text-ink/70">No exams in this category yet.</p>
  return (
    <ul className={gridClass}>
      {exams.map((exam) => (
        <li key={exam.id}>
          <ExamCard exam={exam} progress={progress} />
        </li>
      ))}
    </ul>
  )
}

/** `progress` is given only to signed-in learners. */
function ExamCard({ exam, progress }: { exam: CatalogExam; progress?: ProgressByTopic }) {
  const attempted = progress ? progressTotals(examTopics(exam), progress).attempted : 0
  return (
    <CardLink to={`/exams/${exam.slug}`} className="h-full gap-3">
      <Tag className="self-start">{categoryLabel(exam.category)}</Tag>
      <div>
        <h2 className="text-xl font-bold">{exam.name}</h2>
        {exam.full_name && <p className="mt-1 text-sm text-ink/70">{exam.full_name}</p>}
      </div>
      <p className="mt-auto font-mono text-xs text-ink/60">
        {plural(exam.subjects.length, 'subject')} · {plural(exam.topic_count, 'topic')} ·{' '}
        {plural(exam.question_count, 'question')}
      </p>
      {progress && (
        <div className="flex flex-col gap-1.5">
          <ProgressBar value={attempted} max={exam.question_count} />
          <p className="font-mono text-xs text-ink/70">
            {attempted} of {exam.question_count} attempted
          </p>
        </div>
      )}
    </CardLink>
  )
}

function ExamGridSkeleton() {
  return (
    <>
      <LoadingLabel>Loading exams…</LoadingLabel>
      <ul className={gridClass}>
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i}>
            <Card className="flex flex-col gap-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mt-4 h-3 w-44 max-w-full" />
            </Card>
          </li>
        ))}
      </ul>
    </>
  )
}

function PlannedNext() {
  return (
    <section aria-labelledby="planned-next" className="mt-10 border-t border-ink/10 pt-6">
      <h2
        id="planned-next"
        className="font-mono text-[0.6875rem] font-medium uppercase tracking-widest text-ink/50"
      >
        Planned next
      </h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {PLANNED.map((name) => (
          <li
            key={name}
            className="rounded-full border border-dashed border-ink/20 px-3 py-1 text-sm text-ink/60"
          >
            {name}
          </li>
        ))}
      </ul>
    </section>
  )
}
