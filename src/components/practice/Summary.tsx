import { useEffect, useRef } from 'react'
import type { BookmarkToggle } from '../../hooks/useBookmarks'
import type { PracticeQuestion } from '../../hooks/usePracticeSet'
import { isCorrect, isGraded, optionLetter } from '../../lib/attempts'
import { cx } from '../../lib/cx'
import { formatDuration, plural } from '../../lib/format'
import type { AttemptStatus, Exam } from '../../types'
import { ButtonLink } from '../ui/Button'
import { Card } from '../ui/Card'
import { Disclosure } from '../ui/Disclosure'
import { Tag } from '../ui/Tag'
import { BookmarkButton, BookmarkMessage } from './BookmarkButton'
import type { Answer } from './QuestionScreen'
import { STATUS_FILL, STATUS_LABEL, STATUS_ORDER, STATUS_TONE, statusCounts } from './status'

export interface PracticeResult extends Answer {
  question: PracticeQuestion
}

type StatusCounts = Record<AttemptStatus, number>

interface SummaryProps {
  /** One per question finished, in order. */
  results: PracticeResult[]
  /** Questions in the session; more than results.length if the learner exited early. */
  total: number
  /** Where "Back to …" goes. */
  exam: Exam
}

const labelClass = 'font-mono text-[0.6875rem] font-medium uppercase tracking-widest text-drop'

export function Summary({ results, total, exam }: SummaryProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }, [])

  const counts = statusCounts(results)
  const correct = results.filter((r) => isCorrect(r.status)).length
  const graded = results.filter((r) => isGraded(r.status)).length
  const accuracy = graded > 0 ? Math.round((correct / graded) * 100) : null
  const time = results.reduce((sum, r) => sum + r.timeSpentMs, 0)
  const mistakes = results.filter((r) => r.status === 'incorrect').map((r) => r.question.id)

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold tracking-tight outline-none md:text-4xl">
          Session summary
        </h1>
        <p className="mt-2 text-ink/70">
          {results.length < total
            ? `You stopped after ${results.length} of ${plural(total, 'question')}.`
            : `You went through ${total === 1 ? 'the question' : `all ${total} questions`}.`}
        </p>
      </header>

      <Card className="flex flex-col gap-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <p className="font-display font-bold">
            <span className="text-5xl">{correct}</span>
            <span className="text-2xl text-ink/60"> / {results.length} correct</span>
          </p>
          <dl className="flex gap-8">
            <div>
              <dt className={labelClass}>Accuracy</dt>
              <dd className="font-display text-2xl font-bold">
                {accuracy === null ? (
                  <>
                    <span aria-hidden>–</span>
                    <span className="sr-only">None yet</span>
                  </>
                ) : (
                  `${accuracy}%`
                )}
              </dd>
            </div>
            <div>
              <dt className={labelClass}>Time</dt>
              <dd className="font-display text-2xl font-bold">{formatDuration(time)}</dd>
            </div>
          </dl>
        </div>
        <p className="-mt-3 text-sm text-ink/60">
          Accuracy counts answered questions only. Answers viewed first and skips are left out.
        </p>

        <StatusBar counts={counts} />

        <div className="flex flex-col gap-3 sm:flex-row">
          {mistakes.length > 0 && (
            <ButtonLink to={`/practice?ids=${mistakes.join(',')}`}>
              Retry {plural(mistakes.length, 'mistake')}
            </ButtonLink>
          )}
          <ButtonLink to={`/exams/${exam.slug}`} variant="secondary">
            Back to {exam.name}
          </ButtonLink>
        </div>
      </Card>

      <section aria-labelledby="review" className="flex flex-col gap-4">
        <h2 id="review" className="text-xl font-bold">
          Review
        </h2>
        <ol className="flex flex-col gap-4">
          {results.map((result, i) => (
            <ReviewItem key={result.question.id} result={result} number={i + 1} />
          ))}
        </ol>
      </section>
    </div>
  )
}

/** One bar split by status, with a legend that also gives the counts. */
export function StatusBar({ counts }: { counts: StatusCounts }) {
  return (
    <div className="flex flex-col gap-3">
      {/* The legend carries the numbers; the bar is the picture of them. */}
      <div aria-hidden className="flex h-3 gap-0.5">
        {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
          <span
            key={s}
            title={`${STATUS_LABEL[s]}: ${counts[s]}`}
            className={cx('rounded-sm', STATUS_FILL[s])}
            style={{ flex: `${counts[s]} 1 0%` }}
          />
        ))}
      </div>
      <ul aria-label="Results by status" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {STATUS_ORDER.map((s) => (
          <li key={s} className={cx('flex items-center gap-2', counts[s] === 0 && 'text-ink/50')}>
            <span aria-hidden className={cx('size-2.5 shrink-0 rounded-sm', STATUS_FILL[s])} />
            {STATUS_LABEL[s]}
            <span className="font-mono font-medium">{counts[s]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface ReviewItemProps {
  result: PracticeResult
  number: number
  /** From a timed test: shows the time spent, and "Not answered" for a skip. */
  timed?: boolean
  /** Shows a bookmark button; from useBookmarkToggle(). */
  bookmark?: BookmarkToggle
}

export function ReviewItem({ result, number, timed = false, bookmark }: ReviewItemProps) {
  const { question, status, selectedIndex } = result
  const option = (i: number) => `${optionLetter(i)}. ${question.options[i]}`

  return (
    <li>
      <Card className="flex flex-col gap-3 pb-1">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-xs text-ink/60">
              {number}. {question.code} · {question.topic.name}
            </p>
            <div className="flex items-center gap-2">
              <Tag tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Tag>
              {bookmark && <BookmarkButton bookmark={bookmark} code={question.code} />}
            </div>
          </div>
          {bookmark && <BookmarkMessage bookmark={bookmark} />}
        </div>
        <p className="whitespace-pre-line break-words">{question.body}</p>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
          <dt className="text-ink/60">Your answer</dt>
          <dd className="mb-2 break-words sm:mb-0">
            {selectedIndex !== null
              ? option(selectedIndex)
              : status === 'revealed'
                ? 'None, you viewed the answer first'
                : timed
                  ? 'Not answered'
                  : 'Skipped'}
          </dd>
          <dt className="text-ink/60">Correct answer</dt>
          <dd className={cx('break-words font-bold', timed && 'mb-2 sm:mb-0')}>{option(question.answer_index)}</dd>
          {timed && (
            <>
              <dt className="text-ink/60">Time spent</dt>
              <dd className="font-mono">{formatDuration(result.timeSpentMs)}</dd>
            </>
          )}
        </dl>
        <Disclosure title="Explanation">
          <p className="whitespace-pre-line">{question.explanation || 'No explanation yet.'}</p>
        </Disclosure>
      </Card>
    </li>
  )
}
