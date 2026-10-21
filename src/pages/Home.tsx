import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { PageHeader } from '../components/layout/PageHeader'
import { Bubble } from '../components/ui/Bubble'
import { ButtonLink } from '../components/ui/Button'
import { Card, CardLink } from '../components/ui/Card'
import { LoadError } from '../components/ui/LoadError'
import { ProgressBar } from '../components/ui/ProgressBar'
import { LoadingLabel, Skeleton } from '../components/ui/Skeleton'
import { examTopics, findTopic, useExamCatalog, type CatalogExam } from '../hooks/useExamCatalog'
import { progressTotals, useTopicProgress, type ProgressByTopic } from '../hooks/useTopicProgress'
import { CATEGORIES } from '../lib/categories'
import { plural } from '../lib/format'
import type { TopicProgressRow } from '../types'

const gridClass = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'

export function Home() {
  const catalog = useExamCatalog()
  const progress = useTopicProgress()

  return (
    <>
      <Greeting />

      {progress.status === 'error' ? (
        <section className="mb-10">
          <LoadError message={`Couldn't load your progress. ${progress.error}`} onRetry={progress.retry} />
        </section>
      ) : (
        catalog.status === 'ready' &&
        progress.status === 'ready' && <ContinueCard exams={catalog.data} progress={progress.data} />
      )}

      <section aria-labelledby="browse-by-goal">
        <h2 id="browse-by-goal" className="mb-4 text-xl font-bold">
          Browse by goal
        </h2>
        {catalog.status === 'error' ? (
          <LoadError message={`Couldn't load the exams. ${catalog.error}`} onRetry={catalog.retry} />
        ) : catalog.status === 'loading' ? (
          <GoalGridSkeleton />
        ) : (
          <GoalGrid exams={catalog.data} />
        )}
      </section>
    </>
  )
}

function timeOfDay(hour: number) {
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function Greeting() {
  const auth = useAuth()
  // Read the clock once, when the page opens.
  const [hour] = useState(() => new Date().getHours())

  // Keep the heading's space while the session loads, so nothing jumps.
  if (auth.status === 'loading') {
    return (
      <header className="mb-6">
        <Skeleton className="h-9 w-72 max-w-full md:h-10" />
      </header>
    )
  }

  if (auth.status !== 'signed-in') {
    return (
      <PageHeader
        title="Welcome to vprep"
        description={
          <>
            Pick a goal to start practising.{' '}
            <Link
              to="/account"
              className="rounded font-bold text-pen underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-pen"
            >
              Sign in
            </Link>{' '}
            to track your progress.
          </>
        }
      />
    )
  }

  const firstName = (auth.profile?.full_name || auth.user.name).trim().split(/\s+/)[0]
  const greeting = timeOfDay(hour)
  return <PageHeader title={firstName ? `${greeting}, ${firstName}` : greeting} />
}

/** The exam of the most recent attempt, if there is one. */
function ContinueCard({ exams, progress }: { exams: CatalogExam[]; progress: ProgressByTopic }) {
  let latest: TopicProgressRow | undefined
  for (const row of progress.values()) {
    if (!latest || Date.parse(row.last_attempt_at) > Date.parse(latest.last_attempt_at)) latest = row
  }
  const found = latest && findTopic(exams, latest.topic_id)
  if (!found) return null

  const { exam, topic } = found
  const { attempted } = progressTotals(examTopics(exam), progress)

  return (
    <section aria-labelledby="continue" className="mb-10">
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="continue" className="font-mono text-[0.6875rem] font-medium uppercase tracking-widest text-drop">
            Continue
          </h2>
          <p className="font-display text-xl font-bold">{exam.name}</p>
          <p className="text-sm text-ink/70">Last practised: {topic.name}</p>
          <div className="mt-2 flex items-center gap-3">
            <ProgressBar value={attempted} max={exam.question_count} className="w-24 shrink-0 sm:w-32" />
            <span className="font-mono text-xs text-ink/70">
              {attempted} of {exam.question_count} attempted
            </span>
          </div>
        </div>
        <ButtonLink to={`/exams/${exam.slug}`} aria-label={`Continue ${exam.name}`} className="shrink-0">
          Continue
        </ButtonLink>
      </Card>
    </section>
  )
}

function GoalGrid({ exams }: { exams: CatalogExam[] }) {
  return (
    <ul className={gridClass}>
      {CATEGORIES.map(({ id, label }) => {
        const inCategory = exams.filter((e) => e.category === id)
        const questions = inCategory.reduce((total, e) => total + e.question_count, 0)
        return (
          <li key={id}>
            <CardLink to={`/exams?category=${id}`} className="h-full gap-3">
              <div className="flex items-center gap-3">
                <span aria-hidden>
                  <Bubble label={label[0]} />
                </span>
                <h3 className="text-lg font-bold">{label}</h3>
              </div>
              <p className="font-mono text-xs text-ink/60">
                {plural(inCategory.length, 'exam')} · {plural(questions, 'question')}
              </p>
              {inCategory.length > 0 && (
                <p className="mt-auto text-sm text-ink/70">{inCategory.map((e) => e.name).join(' · ')}</p>
              )}
            </CardLink>
          </li>
        )
      })}
    </ul>
  )
}

function GoalGridSkeleton() {
  return (
    <>
      <LoadingLabel>Loading exams…</LoadingLabel>
      <ul className={gridClass}>
        {CATEGORIES.map(({ id }) => (
          <li key={id}>
            <Card className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Skeleton circle className="size-8" />
                <Skeleton className="h-5 w-28" />
              </div>
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-4 w-44 max-w-full" />
            </Card>
          </li>
        ))}
      </ul>
    </>
  )
}
