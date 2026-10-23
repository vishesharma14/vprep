import { useId, type ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import { PageHeader } from '../components/layout/PageHeader'
import { StatusBar } from '../components/practice/Summary'
import { STATUS_ORDER } from '../components/practice/status'
import { GoalBubbles } from '../components/progress/GoalBubbles'
import { Percent } from '../components/progress/Percent'
import { ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { LoadError } from '../components/ui/LoadError'
import { ProgressBar } from '../components/ui/ProgressBar'
import { LoadingLabel, Skeleton } from '../components/ui/Skeleton'
import { independentPercent, totalsAccuracy, useMyProgress } from '../hooks/useMyProgress'
import { accuracyPercent } from '../hooks/useTopicProgress'
import { cx } from '../lib/cx'
import { formatDay, formatDuration, plural } from '../lib/format'
import type {
  AttemptStatus,
  MyProgress,
  MyProgressDay,
  MyProgressSubject,
  MyProgressTopic,
  MyProgressTotals,
} from '../types'

const labelClass = 'font-mono text-[0.6875rem] font-medium uppercase tracking-widest text-drop'

const kpiGridClass = 'grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5'

/** Most topics shown in "Needs work" and in "Strong topics". */
const MAX_TOPICS = 6

export function Progress() {
  const auth = useAuth()
  // RequireAuth renders this page only for signed-in learners.
  if (auth.status !== 'signed-in') return null
  return <ProgressPage userId={auth.user.id} profileGoal={auth.profile?.daily_goal ?? null} />
}

function ProgressPage({ userId, profileGoal }: { userId: string; profileGoal: number | null }) {
  const progress = useMyProgress(userId)

  return (
    <>
      <PageHeader title="Progress" description="How your practice is going, from every answer you've saved." />
      {progress.status === 'error' ? (
        <LoadError message={`Couldn't load your progress. ${progress.error}`} onRetry={progress.retry} />
      ) : progress.status === 'loading' ? (
        <ProgressSkeleton />
      ) : progress.data.totals.attempts === 0 ? (
        <NoProgress />
      ) : (
        // The profile changes as soon as a new goal is saved on Account.
        <Dashboard progress={progress.data} goal={profileGoal ?? progress.data.daily_goal} />
      )}
    </>
  )
}

function Dashboard({ progress, goal }: { progress: MyProgress; goal: number | null }) {
  return (
    <div className="flex flex-col gap-6">
      <Kpis progress={progress} />
      <Section title="How you solved them">
        <StatusBar counts={statusCounts(progress.totals)} />
      </Section>
      <DailyChart days={progress.daily} timeZone={progress.time_zone} />
      <SubjectAccuracy subjects={progress.subjects} />
      <div className="grid gap-6 lg:grid-cols-2">
        <NeedsWork topics={progress.topics} />
        <StrongTopics topics={progress.topics} />
      </div>
      {goal !== null && (
        <Section title="Daily goal">
          <GoalBubbles done={progress.today_count} goal={goal} />
          <ButtonLink to="/account" variant="secondary" size="sm" className="self-start">
            Change goal
          </ButtonLink>
        </Section>
      )}
    </div>
  )
}

/** A card with a heading, labelling the section around it. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId}>
      <Card className="flex h-full flex-col gap-4">
        <h2 id={headingId} className="text-lg font-bold">
          {title}
        </h2>
        {children}
      </Card>
    </section>
  )
}

function statusCounts(totals: MyProgressTotals) {
  return Object.fromEntries(STATUS_ORDER.map((s) => [s, totals[s]])) as Record<AttemptStatus, number>
}

function Kpis({ progress }: { progress: MyProgress }) {
  const { totals, streak } = progress
  const correct = totals.independent + totals.hint
  const answered = correct + totals.incorrect
  const tried = totals.attempts - totals.skipped

  return (
    <div className="flex flex-col gap-3">
      <dl className={kpiGridClass}>
        <Kpi label="Questions attempted" value={totals.unique_questions} note={plural(totals.attempts, 'attempt')} />
        <Kpi
          label="Accuracy"
          value={<Percent value={totalsAccuracy(totals)} />}
          note={answered > 0 ? `${correct} of ${answered} correct` : 'No answers yet'}
        />
        <Kpi
          label="Solved independently"
          value={<Percent value={independentPercent(totals)} />}
          note={tried > 0 ? `${totals.independent} of ${tried} not skipped` : 'Nothing answered yet'}
        />
        <Kpi label="Practice time" value={formatDuration(totals.time_ms)} />
        <Kpi
          label="Streak"
          value={plural(streak.current, 'day')}
          note={`best ${plural(streak.best, 'day')}`}
          className="col-span-2 sm:col-span-1"
        />
      </dl>
      <p className="text-sm text-ink/60">
        Accuracy counts answered questions only: answers viewed first and skips are left out. Solved
        independently counts every attempt except skips.
      </p>
    </div>
  )
}

function Kpi({
  label,
  value,
  note,
  className,
}: {
  label: string
  value: ReactNode
  note?: string
  className?: string
}) {
  return (
    <Card className={cx('flex flex-col gap-1', className)}>
      <dt className={labelClass}>{label}</dt>
      <dd className="font-display text-2xl font-bold">{value}</dd>
      {note && <dd className="text-sm text-ink/60">{note}</dd>}
    </Card>
  )
}

/** The top of the y-axis: a round number at or above `n`, and at least 5. */
function axisMax(n: number) {
  if (n <= 5) return 5
  const power = 10 ** Math.floor(Math.log10(n))
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * power >= n) ?? 10
  return Math.round(step * power)
}

const sumAttempts = (days: MyProgressDay[]) => days.reduce((total, d) => total + d.attempts, 0)

function DailyChart({ days, timeZone }: { days: MyProgressDay[]; timeZone: string }) {
  const headingId = useId()
  const max = axisMax(Math.max(0, ...days.map((d) => d.attempts)))
  const last = days.length - 1

  return (
    <section aria-labelledby={headingId}>
      <Card className="flex flex-col gap-4">
        <div>
          <h2 id={headingId} className="text-lg font-bold">
            Last {days.length} days
          </h2>
          <p className="mt-1 font-mono text-xs text-ink/70">
            {sumAttempts(days.slice(-7))} this week · {sumAttempts(days.slice(-14, -7))} the week before
          </p>
        </div>

        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
          <div
            aria-hidden
            className="flex h-36 flex-col justify-between text-right font-mono text-[0.6875rem] leading-none tabular-nums text-ink/60"
          >
            <span className="-translate-y-1/2">{max}</span>
            <span className="translate-y-1/2">0</span>
          </div>
          <ol aria-label="Questions per day" className="flex h-36 gap-1 border-y border-ink/10">
            {days.map((d, i) => {
              const label = `${i === last ? 'Today, ' : ''}${formatDay(d.day)}: ${plural(d.attempts, 'question')}, ${d.correct} correct`
              return (
                <li key={d.day} className="flex min-w-0 flex-1">
                  <span
                    role="img"
                    aria-label={label}
                    title={label}
                    className="flex w-full flex-col items-center justify-end rounded-t-sm hover:bg-ink/5"
                  >
                    {d.attempts > 0 && (
                      <span
                        className={cx('w-full max-w-6 rounded-t-sm', i === last ? 'bg-drop' : 'bg-pen')}
                        style={{ height: `max(2px, ${(d.attempts / max) * 100}%)` }}
                      />
                    )}
                  </span>
                </li>
              )
            })}
          </ol>

          {/* Every other day below lg, where "Today" would run into its neighbour. */}
          <div aria-hidden className="col-start-2 mt-1.5 flex gap-1 font-mono text-[0.6875rem] text-ink/60">
            {days.map((d, i) => (
              <span key={d.day} className="flex min-w-0 flex-1 justify-center">
                <span
                  className={cx(
                    'whitespace-nowrap',
                    i === last && 'font-bold text-ink',
                    (last - i) % 2 === 1 && 'invisible lg:visible',
                  )}
                >
                  {i === last ? 'Today' : Number(d.day.slice(8))}
                </span>
              </span>
            ))}
          </div>
        </div>

        <p className="text-xs text-ink/60">Days in {timeZone} time.</p>
      </Card>
    </section>
  )
}

/** correct / answered, for sorting; 0 before any graded answer. */
const ratio = (row: { answered: number; correct: number }) => (row.answered > 0 ? row.correct / row.answered : 0)

// Ties in accuracy go to the row with more answers, then by name.
const subjectName = (s: MyProgressSubject) => `${s.exam_name} ${s.subject_name}`
const topicName = (t: MyProgressTopic) => `${t.topic_name} ${t.exam_name} ${t.subject_name}`

function SubjectAccuracy({ subjects }: { subjects: MyProgressSubject[] }) {
  const rows = subjects
    .filter((s) => s.answered > 0)
    .sort(
      (a, b) =>
        ratio(a) - ratio(b) || b.answered - a.answered || subjectName(a).localeCompare(subjectName(b)),
    )

  return (
    <Section title="Accuracy by subject">
      {rows.length === 0 ? (
        <p className="text-ink/70">Answer a question, rather than viewing the answer, to see your accuracy here.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((s) => {
            const percent = accuracyPercent(s) ?? 0
            return (
              <li
                key={s.subject_id}
                title={`${s.correct} of ${s.answered} correct`}
                className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_3rem]"
              >
                <p className="col-span-2 break-words text-sm sm:col-span-1">
                  <span className="text-ink/60">{s.exam_name} · </span>
                  <span className="font-bold">{s.subject_name}</span>
                </p>
                <ProgressBar value={percent} max={100} />
                <p className="text-right font-mono text-sm font-medium">
                  {percent}%<span className="sr-only">, {s.correct} of {s.answered} correct</span>
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

/** Below 60% over at least 2 answers, or with an open mistake; worst first. */
function needingWork(topics: MyProgressTopic[]) {
  return topics
    .filter((t) => (t.answered >= 2 && t.correct * 100 < t.answered * 60) || t.open_mistakes > 0)
    .sort(
      (a, b) =>
        ratio(a) - ratio(b) ||
        b.open_mistakes - a.open_mistakes ||
        b.answered - a.answered ||
        topicName(a).localeCompare(topicName(b)),
    )
    .slice(0, MAX_TOPICS)
}

/** 80% or more over at least 3 answers, with no open mistakes; best first. */
function strong(topics: MyProgressTopic[]) {
  return topics
    .filter((t) => t.answered >= 3 && t.correct * 100 >= t.answered * 80 && t.open_mistakes === 0)
    .sort((a, b) => ratio(b) - ratio(a) || b.answered - a.answered || topicName(a).localeCompare(topicName(b)))
    .slice(0, MAX_TOPICS)
}

function NeedsWork({ topics }: { topics: MyProgressTopic[] }) {
  const rows = needingWork(topics)
  return (
    <Section title="Needs work">
      {rows.length === 0 ? (
        <p className="text-ink/70">
          Nothing needs work right now. Topics where you're below 60%, or have open mistakes, show up here.
        </p>
      ) : (
        <TopicList>
          {rows.map((t) => (
            <TopicItem key={t.topic_id} topic={t}>
              <ButtonLink
                to={`/practice?topic=${t.topic_id}`}
                variant="secondary"
                size="sm"
                aria-label={`Practise: ${t.topic_name}`}
                className="shrink-0"
              >
                Practise
              </ButtonLink>
            </TopicItem>
          ))}
        </TopicList>
      )}
    </Section>
  )
}

function StrongTopics({ topics }: { topics: MyProgressTopic[] }) {
  const rows = strong(topics)
  return (
    <Section title="Strong topics">
      {rows.length === 0 ? (
        <p className="text-ink/70">
          No strong topics yet. Score 80% or more over at least 3 answers in a topic, with no open mistakes, and
          it shows up here.
        </p>
      ) : (
        <TopicList>
          {rows.map((t) => (
            <TopicItem key={t.topic_id} topic={t} />
          ))}
        </TopicList>
      )}
    </Section>
  )
}

function TopicList({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col divide-y divide-ink/10">{children}</ul>
}

function TopicItem({ topic, children }: { topic: MyProgressTopic; children?: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="break-words font-bold">{topic.topic_name}</p>
        <p className="break-words text-xs text-ink/60">
          {topic.exam_name} · {topic.subject_name}
        </p>
        <p className="mt-1 font-mono text-xs text-ink/70">
          <Percent value={accuracyPercent(topic)} /> accuracy over {plural(topic.answered, 'answer')}
          {topic.open_mistakes > 0 && ` · ${plural(topic.open_mistakes, 'open mistake')}`}
        </p>
      </div>
      {children}
    </li>
  )
}

function NoProgress() {
  return (
    <Card className="flex max-w-md flex-col items-start gap-4">
      <p>Your progress shows up here after your first answer.</p>
      <ButtonLink to="/exams">Browse exams</ButtonLink>
    </Card>
  )
}

function ProgressSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingLabel>Loading your progress…</LoadingLabel>
      <div className={kpiGridClass}>
        {Array.from({ length: 5 }, (_, i) => (
          <Card key={i} className={cx('flex flex-col gap-2', i === 4 && 'col-span-2 sm:col-span-1')}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-4 w-24 max-w-full" />
          </Card>
        ))}
      </div>
      <Card className="flex flex-col gap-4">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </Card>
      <Card className="flex flex-col gap-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-36 w-full" />
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <Card key={i} className="flex flex-col gap-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </Card>
        ))}
      </div>
    </div>
  )
}
