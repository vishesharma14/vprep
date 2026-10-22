import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { PageHeader } from '../components/layout/PageHeader'
import { GuestNotice } from '../components/practice/GuestNotice'
import type { PracticeResult } from '../components/practice/Summary'
import { TestResult, type SaveState, type TestOutcome } from '../components/test/TestResult'
import { TestRunner } from '../components/test/TestRunner'
import { TestSetup } from '../components/test/TestSetup'
import { Button, ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { LoadError } from '../components/ui/LoadError'
import { LoadingLabel, Skeleton } from '../components/ui/Skeleton'
import { Tag } from '../components/ui/Tag'
import { useExamCatalog, type CatalogExam } from '../hooks/useExamCatalog'
import { parseScope, usePracticeSet, type PracticeQuestion, type PracticeScope } from '../hooks/usePracticeSet'
import { answerStatus, saveAttempts } from '../lib/attempts'
import { categoryLabel } from '../lib/categories'
import { cx } from '../lib/cx'
import { plural } from '../lib/format'
import {
  clearRunningTest,
  loadRunningTest,
  newTest,
  saveRunningTest,
  shuffle,
  type RunningTest,
} from '../lib/timedTest'

/** A test covers a topic, a subject or a whole exam (not a hand-picked list). */
type TestScope = Exclude<PracticeScope, { kind: 'ids' }>

const scopeKey = (scope: TestScope) => `${scope.kind}:${scope.kind === 'exam' ? scope.slug : scope.id}`

export function TimedTest() {
  const [params] = useSearchParams()
  const { key } = useLocation()
  const scope = useMemo(() => {
    const parsed = parseScope(params)
    return parsed && parsed.kind !== 'ids' ? parsed : null
  }, [params])

  if (!scope) return <PickTest />
  return <TestLoader key={key} scope={scope} />
}

function TestLoader({ scope }: { scope: TestScope }) {
  const auth = useAuth()
  const set = usePracticeSet(scope)

  if (set.status === 'loading') return <TestSkeleton />
  if (set.status === 'error') {
    return (
      <>
        <PageHeader title="Timed test" />
        <LoadError message={`Couldn't load the questions. ${set.error}`} onRetry={set.retry} />
      </>
    )
  }
  if (set.data.questions.length === 0) return <NoQuestions />
  return <TestFlow questions={set.data.questions} scope={scope} signedIn={auth.status === 'signed-in'} />
}

/** "GATE CSE mock", with where the questions come from. */
function describe(scope: TestScope, { exam, subject, topic }: PracticeQuestion) {
  switch (scope.kind) {
    case 'exam':
      return { title: `${exam.name} mock`, context: exam.full_name ?? undefined }
    case 'subject':
      return { title: `${subject.name} test`, context: exam.name }
    case 'topic':
      return { title: `${topic.name} test`, context: `${exam.name} / ${subject.name}` }
  }
}

/** The saved test, minus any question no longer published. Null if none are left. */
function resumable(test: RunningTest, byId: Map<string, PracticeQuestion>): RunningTest | null {
  const keep = test.questionIds.flatMap((id, i) => (byId.has(id) ? [i] : []))
  if (keep.length === 0) return null
  const pick = <T,>(list: T[]) => keep.map((i) => list[i])
  const questionIds = pick(test.questionIds)
  return {
    ...test,
    questionIds,
    // An option that no longer exists counts as no answer.
    answers: pick(test.answers).map((a, i) => (a !== null && a < byId.get(questionIds[i])!.options.length ? a : null)),
    marked: pick(test.marked),
    spent: pick(test.spent),
    current: Math.max(0, keep.indexOf(test.current)),
  }
}

/** Same rules as practice, without hints: right, wrong, or skipped when unanswered. */
function grade(test: RunningTest, byId: Map<string, PracticeQuestion>): PracticeResult[] {
  return test.questionIds.map((id, i) => {
    const question = byId.get(id)!
    const selectedIndex = test.answers[i]
    return {
      question,
      status: selectedIndex === null ? 'skipped' : answerStatus(selectedIndex, question.answer_index, false),
      selectedIndex,
      timeSpentMs: test.spent[i],
    }
  })
}

type Phase =
  | { kind: 'setup' }
  | { kind: 'running'; test: RunningTest }
  | { kind: 'done'; outcome: TestOutcome }

const phaseWidth: Record<Phase['kind'], string> = {
  setup: 'max-w-xl',
  running: '',
  done: 'max-w-3xl',
}

function TestFlow({
  questions,
  scope,
  signedIn,
}: {
  questions: PracticeQuestion[]
  scope: TestScope
  signedIn: boolean
}) {
  const { signInCount } = useAuth()
  const navigate = useNavigate()
  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions])
  const key = scopeKey(scope)
  const { title, context } = describe(scope, questions[0])
  const exam = questions[0].exam
  const [phase, setPhase] = useState<Phase>(() => {
    // A refresh (or coming back to this page) resumes the test with its deadline.
    const saved = loadRunningTest(key)
    const test = saved && resumable(saved, byId)
    return test ? { kind: 'running', test } : { kind: 'setup' }
  })
  const [save, setSave] = useState<SaveState | null>(null)
  // Bumped per save, so a slow save from an earlier test can't overwrite a newer state.
  const saveRun = useRef(0)

  function start(count: number, secondsPerQuestion: number) {
    const ids = shuffle(questions)
      .slice(0, count)
      .map((q) => q.id)
    const test = newTest(key, ids, secondsPerQuestion)
    saveRunningTest(test)
    setPhase({ kind: 'running', test })
  }

  function submit(test: RunningTest, timedOut: boolean) {
    clearRunningTest()
    const results = grade(test, byId)
    setPhase({
      kind: 'done',
      outcome: {
        results,
        timedOut,
        allowedMs: test.deadline - test.startedAt,
        usedMs: Math.min(Date.now(), test.deadline) - test.startedAt,
      },
    })
    if (signedIn) send(results)
  }

  /** Saves every answer in one insert. */
  function send(results: PracticeResult[]) {
    const run = ++saveRun.current
    setSave({ status: 'saving' })
    void saveAttempts(
      results.map((r) => ({
        question_id: r.question.id,
        mode: 'timed',
        status: r.status,
        selected_index: r.selectedIndex,
        time_spent_ms: r.timeSpentMs,
      })),
    ).then((error) => {
      if (run === saveRun.current) setSave(error ? { status: 'failed', error } : { status: 'saved' })
    })
  }

  function leave() {
    clearRunningTest()
    navigate(`/exams/${exam.slug}`)
  }

  function restart() {
    saveRun.current++
    setSave(null)
    setPhase({ kind: 'setup' })
  }

  // Signing in again after the sign-in expired saves the answers that failed meanwhile.
  const handledSignIns = useRef(signInCount)
  useEffect(() => {
    if (handledSignIns.current === signInCount) return
    handledSignIns.current = signInCount
    if (signedIn && phase.kind === 'done' && save?.status === 'failed') send(phase.outcome.results)
  })

  return (
    <div className={cx('mx-auto flex w-full flex-col gap-4', phaseWidth[phase.kind])}>
      {!signedIn && <GuestNotice />}
      {phase.kind === 'setup' ? (
        <TestSetup title={title} context={context} available={questions.length} onStart={start} />
      ) : phase.kind === 'running' ? (
        <TestRunner
          title={title}
          initial={phase.test}
          questions={phase.test.questionIds.map((id) => byId.get(id)!)}
          onSubmit={submit}
          onLeave={leave}
        />
      ) : (
        <TestResult
          title={title}
          outcome={phase.outcome}
          exam={exam}
          save={save}
          onRetrySave={() => send(phase.outcome.results)}
          onRestart={restart}
        />
      )}
    </div>
  )
}

const gridClass = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'

function PickTest() {
  const catalog = useExamCatalog()
  return (
    <>
      <PageHeader
        title="Timed test"
        description="Exam-hall mode: a countdown, an answer sheet, and the answers only once you submit."
      />
      <h2 className="mb-4 text-xl font-bold">Pick a test</h2>
      {catalog.status === 'error' ? (
        <LoadError message={`Couldn't load the exams. ${catalog.error}`} onRetry={catalog.retry} />
      ) : catalog.status === 'loading' ? (
        <>
          <LoadingLabel>Loading exams…</LoadingLabel>
          <ul className={gridClass}>
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i}>
                <Card className="flex flex-col gap-3">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-6 w-28" />
                  <Skeleton className="mt-4 h-3 w-24" />
                  <Skeleton className="h-8 w-28" />
                </Card>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <ul className={gridClass}>
          {catalog.data.map((exam) => (
            <li key={exam.id}>
              <MockCard exam={exam} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function MockCard({ exam }: { exam: CatalogExam }) {
  const empty = exam.question_count === 0
  return (
    <Card className="flex h-full flex-col gap-3">
      <Tag className="self-start">{categoryLabel(exam.category)}</Tag>
      <div>
        <h3 className="text-xl font-bold">{exam.name}</h3>
        {exam.full_name && <p className="mt-1 text-sm text-ink/70">{exam.full_name}</p>}
      </div>
      <p className="mt-auto font-mono text-xs text-ink/60">
        {empty ? 'No questions yet' : plural(exam.question_count, 'question')}
      </p>
      {empty ? (
        <Button size="sm" disabled className="self-start">
          Start mock
        </Button>
      ) : (
        <ButtonLink
          to={`/test?exam=${exam.slug}`}
          size="sm"
          aria-label={`Start ${exam.name} mock`}
          className="self-start"
        >
          Start mock
        </ButtonLink>
      )}
    </Card>
  )
}

function NoQuestions() {
  return (
    <>
      <PageHeader title="Timed test" />
      <Card className="flex max-w-md flex-col items-start gap-4">
        <p>There are no published questions here yet. The link may be out of date.</p>
        <ButtonLink to="/test">Pick a test</ButtonLink>
      </Card>
    </>
  )
}

function TestSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <LoadingLabel>Loading the test…</LoadingLabel>
      <Skeleton className="h-9 w-56 max-w-full" />
      <Card className="flex flex-col gap-6">
        <Skeleton className="h-4 w-48" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-16 rounded-full" />
          ))}
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-16 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-11 w-32" />
      </Card>
    </div>
  )
}
