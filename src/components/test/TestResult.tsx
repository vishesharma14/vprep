import { useEffect, useRef } from 'react'
import { useBookmarkToggle } from '../../hooks/useBookmarks'
import { isCorrect, isGraded } from '../../lib/attempts'
import { cx } from '../../lib/cx'
import { formatDuration, plural } from '../../lib/format'
import { topicScores } from '../../lib/timedTest'
import type { Exam } from '../../types'
import { statusCounts } from '../practice/status'
import { ReviewItem, StatusBar, type PracticeResult } from '../practice/Summary'
import { Button, ButtonLink } from '../ui/Button'
import { Card } from '../ui/Card'
import { Notice } from '../ui/Notice'
import { ProgressBar } from '../ui/ProgressBar'

export type SaveState = { status: 'saving' } | { status: 'saved' } | { status: 'failed'; error: string }

/** A submitted test. */
export interface TestOutcome {
  /** One per question, in test order. */
  results: PracticeResult[]
  allowedMs: number
  usedMs: number
  /** Submitted automatically at the deadline. */
  timedOut: boolean
}

interface TestResultProps {
  title: string
  outcome: TestOutcome
  /** Where "Back to …" goes. */
  exam: Exam
  /** Null for guests: nothing is saved. */
  save: SaveState | null
  onRetrySave: () => void
  onRestart: () => void
}

const labelClass = 'font-mono text-[0.6875rem] font-medium uppercase tracking-widest text-drop'

export function TestResult({ title, outcome, exam, save, onRetrySave, onRestart }: TestResultProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }, [])

  const { results, allowedMs, usedMs, timedOut } = outcome
  const correct = results.filter((r) => isCorrect(r.status)).length
  const answered = results.filter((r) => isGraded(r.status)).length
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : null
  const mistakes = results.filter((r) => r.status === 'incorrect').map((r) => r.question.id)

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold tracking-tight outline-none md:text-4xl">
          Test result
        </h1>
        <p className="mt-2 text-ink/70">
          {title} · {plural(results.length, 'question')}
        </p>
      </header>

      {(timedOut || save) && (
        <div className="flex flex-col gap-3">
          {timedOut && <Notice tone="info">Time's up. Your test was submitted.</Notice>}
          {save && <SaveStatus save={save} onRetry={onRetrySave} />}
        </div>
      )}

      <Card className="flex flex-col gap-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <p className="font-display font-bold">
            <span className="text-5xl">{correct}</span>
            <span className="text-2xl text-ink/60"> / {results.length} correct</span>
          </p>
          <dl className="flex flex-wrap gap-x-8 gap-y-4">
            <div>
              <dt className={labelClass}>Accuracy</dt>
              <dd className="font-display text-2xl font-bold">
                {accuracy === null ? (
                  <>
                    <span aria-hidden>–</span>
                    <span className="sr-only">None, no question was answered</span>
                  </>
                ) : (
                  `${accuracy}%`
                )}
              </dd>
            </div>
            <div>
              <dt className={labelClass}>Time used</dt>
              <dd className="font-display text-2xl font-bold">
                {formatDuration(usedMs)}
                <span className="text-base font-normal text-ink/60"> of {formatDuration(allowedMs)}</span>
              </dd>
            </div>
          </dl>
        </div>
        <p className="-mt-3 text-sm text-ink/60">
          Accuracy is correct answers out of {plural(answered, 'answered question')}. Unanswered ones are left out.
        </p>

        <StatusBar counts={statusCounts(results)} />

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {mistakes.length > 0 && (
            <ButtonLink to={`/practice?ids=${mistakes.join(',')}`}>
              Retry {plural(mistakes.length, 'mistake')}
            </ButtonLink>
          )}
          <Button variant="secondary" onClick={onRestart}>
            Take another test
          </Button>
          <ButtonLink to={`/exams/${exam.slug}`} variant="secondary">
            Back to {exam.name}
          </ButtonLink>
        </div>
      </Card>

      <section aria-labelledby="by-topic" className="flex flex-col gap-4">
        <h2 id="by-topic" className="text-xl font-bold">
          By topic
        </h2>
        <Card>
          <table className="w-full text-sm">
            <caption className="sr-only">Correct answers per topic, weakest first</caption>
            <thead>
              <tr className={labelClass}>
                <th scope="col" className="pb-2 text-left font-medium">
                  Topic
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Correct
                </th>
              </tr>
            </thead>
            <tbody>
              {topicScores(results).map((score) => (
                <tr key={score.topic.id} className="border-t border-ink/10">
                  <th scope="row" className="py-3 pr-3 text-left font-normal">
                    <span className="block break-words font-bold">{score.topic.name}</span>
                    <span className="block text-xs text-ink/60">{score.subject.name}</span>
                  </th>
                  <td className="py-3">
                    <span className="flex items-center justify-end gap-3">
                      <ProgressBar value={score.correct} max={score.total} className="w-12 sm:w-24" />
                      <span className="whitespace-nowrap font-mono">
                        {score.correct} / {score.total}
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section aria-labelledby="review" className="flex flex-col gap-4">
        <h2 id="review" className="text-xl font-bold">
          Review
        </h2>
        <ol className="flex flex-col gap-4">
          {results.map((result, i) => (
            <BookmarkableReviewItem key={result.question.id} result={result} number={i + 1} />
          ))}
        </ol>
      </section>
    </div>
  )
}

/** A reviewed question with its bookmark button. */
function BookmarkableReviewItem({ result, number }: { result: PracticeResult; number: number }) {
  const bookmark = useBookmarkToggle(result.question.id)
  return <ReviewItem result={result} number={number} timed bookmark={bookmark} />
}

function SaveStatus({ save, onRetry }: { save: SaveState; onRetry: () => void }) {
  if (save.status === 'failed') {
    return (
      <Notice tone="bad">
        Your answers weren't saved. {save.error}{' '}
        <button
          type="button"
          onClick={onRetry}
          className="rounded font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-bad"
        >
          Retry
        </button>
      </Notice>
    )
  }
  return (
    <p role="status" className={cx('text-sm', save.status === 'saved' ? 'text-ok' : 'text-ink/60')}>
      {save.status === 'saved' ? 'Saved to your progress.' : 'Saving your answers…'}
    </p>
  )
}
