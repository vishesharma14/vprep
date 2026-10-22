import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { signInHref } from '../auth/redirect'
import { useAuth } from '../auth/useAuth'
import { PageHeader } from '../components/layout/PageHeader'
import { QuestionScreen, type Answer } from '../components/practice/QuestionScreen'
import { Summary, type PracticeResult } from '../components/practice/Summary'
import { ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { LoadError } from '../components/ui/LoadError'
import { Notice } from '../components/ui/Notice'
import { LoadingLabel, Skeleton } from '../components/ui/Skeleton'
import { parseScope, usePracticeSet, type PracticeScope, type PracticeSet } from '../hooks/usePracticeSet'
import { saveAttempt } from '../lib/attempts'
import { plural } from '../lib/format'

const pageClass = 'mx-auto w-full max-w-3xl'

export function Practice() {
  const [params] = useSearchParams()
  const { key } = useLocation()
  const scope = useMemo(() => parseScope(params), [params])

  if (!scope) return <PickExam />
  // Every visit starts a fresh session, even to the same address
  // (e.g. "Retry mistakes" twice in a row).
  return <PracticeLoader key={key} scope={scope} />
}

function PracticeLoader({ scope }: { scope: PracticeScope }) {
  const auth = useAuth()
  const set = usePracticeSet(scope)

  if (set.status === 'loading') return <PracticeSkeleton />
  if (set.status === 'error') {
    return (
      <div className={pageClass}>
        <PageHeader title="Practice" />
        <LoadError message={`Couldn't load the questions. ${set.error}`} onRetry={set.retry} />
      </div>
    )
  }
  if (set.data.questions.length === 0) return <NoQuestions />
  return <PracticeSession set={set.data} signedIn={auth.status === 'signed-in'} />
}

type SaveState = { status: 'saving' } | { status: 'saved' } | { status: 'failed'; error: string }

function PracticeSession({ set, signedIn }: { set: PracticeSet; signedIn: boolean }) {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const { questions, pool } = set
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<PracticeResult[]>([])
  // Keyed by position in `results`.
  const [saves, setSaves] = useState<Record<number, SaveState>>({})
  const [finished, setFinished] = useState(false)
  const question = questions[index]
  const exam = questions[0].exam

  function save(position: number, result: PracticeResult) {
    setSaves((s) => ({ ...s, [position]: { status: 'saving' } }))
    void saveAttempt({
      question_id: result.question.id,
      mode: 'practice',
      status: result.status,
      selected_index: result.selectedIndex,
      time_spent_ms: result.timeSpentMs,
    }).then((error) =>
      setSaves((s) => ({ ...s, [position]: error ? { status: 'failed', error } : { status: 'saved' } })),
    )
  }

  function answer(a: Answer) {
    const result = { ...a, question }
    setResults([...results, result])
    if (signedIn) save(results.length, result)
  }

  function next() {
    if (index + 1 < questions.length) setIndex(index + 1)
    else setFinished(true)
  }

  function exit() {
    if (results.length > 0) setFinished(true)
    else navigate(`/exams/${exam.slug}`)
  }

  function retryFailed() {
    results.forEach((result, position) => {
      if (saves[position]?.status === 'failed') save(position, result)
    })
  }

  // Retrying moves these back to "saving", which hides the notice until they settle.
  const failed = Object.values(saves).filter((s) => s.status === 'failed')

  return (
    <div className={`${pageClass} flex flex-col gap-4`}>
      {!signedIn && (
        <Notice tone="info">
          You're practising as a guest.{' '}
          <Link
            to={signInHref(pathname + search)}
            className="rounded font-bold text-pen underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-pen"
          >
            Sign in
          </Link>{' '}
          to save your progress.
        </Notice>
      )}
      {failed.length > 0 && (
        <Notice tone="bad">
          {failed.length === 1 ? "1 answer wasn't saved." : `${plural(failed.length, 'answer')} weren't saved.`}{' '}
          {failed.at(-1)?.error}{' '}
          <button
            type="button"
            onClick={retryFailed}
            className="rounded font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-bad"
          >
            Retry
          </button>
        </Notice>
      )}

      {finished ? (
        <Summary results={results} total={questions.length} exam={exam} />
      ) : (
        <QuestionScreen
          key={question.id}
          question={question}
          pool={pool}
          position={index}
          total={questions.length}
          done={results.length}
          signedIn={signedIn}
          onAnswer={answer}
          onNext={next}
          onExit={exit}
        />
      )}
    </div>
  )
}

function PickExam() {
  return (
    <div className={pageClass}>
      <PageHeader title="Practice" />
      <Card className="flex max-w-md flex-col items-start gap-4">
        <p className="text-lg font-bold">Pick an exam to practise</p>
        <p className="text-ink/70">Choose an exam, then practise a whole subject or one topic at a time.</p>
        <ButtonLink to="/exams">Browse exams</ButtonLink>
      </Card>
    </div>
  )
}

function NoQuestions() {
  return (
    <div className={pageClass}>
      <PageHeader title="Practice" />
      <Card className="flex max-w-md flex-col items-start gap-4">
        <p>There are no published questions here yet. The link may be out of date.</p>
        <ButtonLink to="/exams">Browse exams</ButtonLink>
      </Card>
    </div>
  )
}

function PracticeSkeleton() {
  return (
    <div className={`${pageClass} flex flex-col gap-4`}>
      <LoadingLabel>Loading questions…</LoadingLabel>
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-14" />
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-1.5 flex-1" />
      </div>
      <Card className="flex flex-col gap-5">
        <Skeleton className="h-3 w-56 max-w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-2/3" />
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </Card>
    </div>
  )
}
