import type { ComponentProps } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { LoadError } from '../components/ui/LoadError'
import { ProgressBar } from '../components/ui/ProgressBar'
import { LoadingLabel, Skeleton } from '../components/ui/Skeleton'
import {
  examTopics,
  useExamCatalog,
  type CatalogExam,
  type CatalogSubject,
  type CatalogTopic,
} from '../hooks/useExamCatalog'
import {
  accuracyPercent,
  progressTotals,
  useTopicProgress,
  type ProgressByTopic,
} from '../hooks/useTopicProgress'
import { categoryLabel } from '../lib/categories'
import { plural } from '../lib/format'

export function ExamDetail() {
  const { slug } = useParams()
  const catalog = useExamCatalog()
  const progress = useTopicProgress()

  if (catalog.status === 'error') {
    return (
      <>
        <PageHeader title="Exam" />
        <LoadError message={`Couldn't load this exam. ${catalog.error}`} onRetry={catalog.retry} />
      </>
    )
  }
  if (catalog.status === 'loading' || progress.status === 'loading') return <ExamDetailSkeleton />

  const exam = catalog.data.find((e) => e.slug === slug)
  if (!exam) return <ExamNotFound />

  const progressData = progress.status === 'ready' && progress.signedIn ? progress.data : undefined

  return (
    <>
      <ExamHeader exam={exam} progress={progressData} />
      {progress.status === 'error' && (
        <div className="mb-8">
          <LoadError message={`Couldn't load your progress. ${progress.error}`} onRetry={progress.retry} />
        </div>
      )}
      <div className="flex flex-col gap-10">
        {exam.subjects.map((subject) => (
          <SubjectSection key={subject.id} subject={subject} progress={progressData} />
        ))}
      </div>
    </>
  )
}

/** A link styled as a button, or a disabled button when there is nothing to open. */
function ActionLink({
  to,
  disabled,
  ...props
}: { to: string; disabled: boolean } & Pick<
  ComponentProps<typeof Button>,
  'variant' | 'size' | 'children' | 'aria-label'
>) {
  return disabled ? <Button disabled {...props} /> : <ButtonLink to={to} {...props} />
}

/** `progress` is given only to signed-in learners (here and below). */
function ExamHeader({ exam, progress }: { exam: CatalogExam; progress?: ProgressByTopic }) {
  const totals = progress && progressTotals(examTopics(exam), progress)
  const accuracy = totals && accuracyPercent(totals)
  const summary = [
    plural(exam.question_count, 'question'),
    totals && `${totals.attempted} attempted`,
    totals && (accuracy === null ? 'no accuracy yet' : `${accuracy}% accuracy`),
  ]
    .filter(Boolean)
    .join(' · ')
  const empty = exam.question_count === 0

  return (
    <header className="mb-10 flex flex-col gap-4">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-wider text-ink/60">
          <li>
            <Link to="/exams" className="rounded hover:text-pen focus-visible:outline-2 focus-visible:outline-pen">
              Exams
            </Link>
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden>/</span>
            <Link
              to={`/exams?category=${exam.category}`}
              className="rounded hover:text-pen focus-visible:outline-2 focus-visible:outline-pen"
            >
              {categoryLabel(exam.category)}
            </Link>
          </li>
        </ol>
      </nav>

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{exam.name}</h1>
          {exam.full_name && <p className="mt-1 text-lg text-ink/70">{exam.full_name}</p>}
          <p className="mt-3 font-mono text-sm text-ink/70">{summary}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <ActionLink to={`/practice?exam=${exam.slug}`} disabled={empty}>
            Practise all
          </ActionLink>
          <ActionLink to={`/test?exam=${exam.slug}`} disabled={empty} variant="secondary">
            Timed test
          </ActionLink>
        </div>
      </div>
    </header>
  )
}

function SubjectSection({ subject, progress }: { subject: CatalogSubject; progress?: ProgressByTopic }) {
  const headingId = `subject-${subject.id}`
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-ink/10 pb-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-xl font-bold">
            {subject.name}
          </h2>
          <p className="font-mono text-xs text-ink/60">{plural(subject.question_count, 'question')}</p>
        </div>
        <ActionLink
          to={`/practice?subject=${subject.id}`}
          disabled={subject.question_count === 0}
          variant="secondary"
          size="sm"
        >
          Practise subject
        </ActionLink>
      </div>
      {subject.topics.length === 0 ? (
        <p className="text-sm text-ink/70">No topics yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {subject.topics.map((topic) => (
            <TopicRow key={topic.id} topic={topic} progress={progress} />
          ))}
        </ul>
      )}
    </section>
  )
}

function TopicRow({ topic, progress }: { topic: CatalogTopic; progress?: ProgressByTopic }) {
  const total = topic.question_count
  const attempted = Math.min(progress?.get(topic.id)?.attempted ?? 0, total)

  return (
    <li>
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="font-bold">{topic.name}</h3>
          {total === 0 ? (
            <p className="text-sm text-ink/60">No questions yet</p>
          ) : (
            <>
              {topic.subtopics.length > 0 && (
                <p className="text-sm text-ink/70">{topic.subtopics.join(' · ')}</p>
              )}
              {progress ? (
                <div className="mt-1 flex items-center gap-3">
                  <ProgressBar value={attempted} max={total} className="w-24 shrink-0 sm:w-32" />
                  <span className="font-mono text-xs text-ink/70">
                    {attempted} of {total} attempted
                  </span>
                </div>
              ) : (
                <p className="font-mono text-xs text-ink/60">{plural(total, 'question')}</p>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <ActionLink
            to={`/practice?topic=${topic.id}`}
            disabled={total === 0}
            size="sm"
            aria-label={`Practise: ${topic.name}`}
          >
            Practise
          </ActionLink>
          <ActionLink
            to={`/test?topic=${topic.id}`}
            disabled={total === 0}
            variant="secondary"
            size="sm"
            aria-label={`Timed: ${topic.name}`}
          >
            Timed
          </ActionLink>
        </div>
      </Card>
    </li>
  )
}

function ExamNotFound() {
  return (
    <>
      <PageHeader title="Exam not found" />
      <Card className="flex max-w-md flex-col items-start gap-4">
        <p>There's no exam at this address. It may have been renamed or removed.</p>
        <ButtonLink to="/exams">See all exams</ButtonLink>
      </Card>
    </>
  )
}

function ExamDetailSkeleton() {
  return (
    <>
      <LoadingLabel>Loading exam…</LoadingLabel>
      <div className="mb-10 flex flex-col gap-4">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-80 max-w-full" />
        <Skeleton className="h-4 w-44" />
        <div className="flex gap-3">
          <Skeleton className="h-11 w-32" />
          <Skeleton className="h-11 w-28" />
        </div>
      </div>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="mb-10 flex flex-col gap-4">
          <Skeleton className="h-6 w-52 max-w-full" />
          {Array.from({ length: 3 }, (_, j) => (
            <Card key={j} className="flex flex-col gap-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </Card>
          ))}
        </div>
      ))}
    </>
  )
}
