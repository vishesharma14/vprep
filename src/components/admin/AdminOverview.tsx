import { useId, type ReactNode } from 'react'
import type { AdminQuestion } from '../../hooks/useAdminQuestions'
import { topicPlaces, type CatalogExam } from '../../hooks/useExamCatalog'
import { cx } from '../../lib/cx'
import { plural } from '../../lib/format'
import { canPublish } from '../../lib/questions'
import { Percent } from '../progress/Percent'
import { ButtonLink } from '../ui/Button'
import { Card } from '../ui/Card'
import { ProgressBar } from '../ui/ProgressBar'
import { LoadingLabel, Skeleton } from '../ui/Skeleton'

const labelClass = 'font-mono text-[0.6875rem] font-medium uppercase tracking-widest text-drop'

const statGridClass = 'grid grid-cols-2 gap-3 sm:grid-cols-3'

const sum = <T,>(items: T[], count: (item: T) => number) => items.reduce((total, item) => total + count(item), 0)

interface AdminOverviewProps {
  exams: CatalogExam[]
  questions: AdminQuestion[]
}

/** Content at a glance: counts, explanation coverage and questions per exam. */
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
      {[0, 1].map((i) => (
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
