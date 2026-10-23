import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useBookmarkToggle } from '../../hooks/useBookmarks'
import { similarQuestions, type PracticeQuestion, type SimilarQuestion } from '../../hooks/usePracticeSet'
import { answerStatus, optionLetter } from '../../lib/attempts'
import { cx } from '../../lib/cx'
import { plural } from '../../lib/format'
import { ATTEMPT_POINTS, type AttemptStatus } from '../../types'
import { Button, ButtonLink } from '../ui/Button'
import { Card } from '../ui/Card'
import { Disclosure } from '../ui/Disclosure'
import { CheckIcon, CrossIcon, EyeIcon } from '../ui/Icon'
import { ProgressBar } from '../ui/ProgressBar'
import { Tag } from '../ui/Tag'
import { BookmarkButton, BookmarkMessage } from './BookmarkButton'
import { FormulaExpression } from './FormulaExpression'
import { OptionList } from './OptionList'
import { ReportButton, ReportForm } from './ReportProblem'
import { STATUS_LABEL } from './status'

/** How one question ended. */
export interface Answer {
  status: AttemptStatus
  /** Null when revealed or skipped. */
  selectedIndex: number | null
  timeSpentMs: number
}

type Verdict = Exclude<AttemptStatus, 'skipped'>

/** A submitted or revealed question, as shown in the feedback. */
interface Outcome {
  status: Verdict
  selectedIndex: number | null
}

const REVEAL_WARNING =
  "Seeing the answer first is recorded as 'Answer viewed first' and won't count toward your accuracy."

const verdictStyles: Record<Verdict, string> = {
  independent: 'bg-ok/10 text-ok',
  hint: 'bg-pen/10 text-pen',
  incorrect: 'bg-bad/10 text-bad',
  revealed: 'bg-warn/10 text-warn',
}

const verdictIcons: Record<Verdict, ReactNode> = {
  independent: <CheckIcon />,
  hint: <CheckIcon />,
  incorrect: <CrossIcon />,
  revealed: <EyeIcon />,
}

// Keyboard shortcuts must not fire while typing or in the "Report a problem"
// panel, and Enter on a focused button or link already activates it.
const TYPING = 'input:not([type="radio"]), textarea, select, [contenteditable="true"], [data-report-panel]'
const ACTIVATES_ON_ENTER = 'button, a, summary'

interface QuestionScreenProps {
  question: PracticeQuestion
  /** Questions to suggest under "Similar questions". */
  pool: SimilarQuestion[]
  /** 0-based position in the session. */
  position: number
  total: number
  /** Questions finished so far, for the progress bar. */
  done: number
  signedIn: boolean
  /** Called once, when the question is submitted, revealed or skipped. */
  onAnswer: (answer: Answer) => void
  onNext: () => void
  onExit: () => void
}

/** One question: attempt it, then see how it went. Mount a fresh one per question. */
export function QuestionScreen({
  question,
  pool,
  position,
  total,
  done,
  signedIn,
  onAnswer,
  onNext,
  onExit,
}: QuestionScreenProps) {
  // Time on the question runs from when it is shown until it is answered.
  const [shownAt] = useState(() => performance.now())
  const [selected, setSelected] = useState<number | null>(null)
  const [hintShown, setHintShown] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [reporting, setReporting] = useState(false)
  const bookmark = useBookmarkToggle(question.id)
  const reportFormId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const hintRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const verdictRef = useRef<HTMLDivElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)
  const isLast = position === total - 1
  const letters = `A–${optionLetter(question.options.length - 1)}`

  // A new question starts at the top, with focus on its heading.
  useEffect(() => {
    if (position === 0) return
    headingRef.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }, [position])

  useEffect(() => {
    if (outcome) verdictRef.current?.focus()
  }, [outcome])

  function finish(status: AttemptStatus, selectedIndex: number | null) {
    onAnswer({ status, selectedIndex, timeSpentMs: performance.now() - shownAt })
  }

  function select(index: number) {
    if (!outcome) setSelected(index)
  }

  function showHint() {
    if (!question.hint || outcome || hintShown) return
    setHintShown(true)
    requestAnimationFrame(() => hintRef.current?.focus())
  }

  function submit() {
    if (outcome || selected === null) return
    const status = answerStatus(selected, question.answer_index, hintShown)
    finish(status, selected)
    setOutcome({ status, selectedIndex: selected })
  }

  function reveal() {
    finish('revealed', null)
    setConfirming(false)
    setOutcome({ status: 'revealed', selectedIndex: null })
  }

  function keepTrying() {
    setConfirming(false)
    requestAnimationFrame(() => actionsRef.current?.querySelector<HTMLElement>('[data-show-answer]')?.focus())
  }

  function skip() {
    finish('skipped', null)
    onNext()
  }

  function closeReport() {
    setReporting(false)
    requestAnimationFrame(() => toolsRef.current?.querySelector<HTMLElement>('[data-report-button]')?.focus())
  }

  // Re-subscribed after every render, so the handler always sees the latest state.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest(TYPING)) return

      if (e.key === 'Escape' && confirming) {
        keepTrying()
        return
      }
      if (e.key === 'Enter') {
        if (target?.closest(ACTIVATES_ON_ENTER)) return
        if (outcome) {
          e.preventDefault()
          onNext()
        } else if (!confirming && selected !== null) {
          e.preventDefault()
          submit()
        }
        return
      }
      if (outcome || e.key.length !== 1) return

      const key = e.key.toLowerCase()
      if (key === 'h') {
        showHint()
        return
      }
      const index = /[1-6]/.test(key) ? Number(key) - 1 : 'abcdef'.indexOf(key)
      if (index >= 0 && index < question.options.length) {
        e.preventDefault()
        select(index)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <article className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={onExit}>
          Exit
        </Button>
        <h1 ref={headingRef} tabIndex={-1} className="shrink-0 font-mono text-sm font-medium outline-none">
          <span aria-hidden>
            Q {position + 1} / {total}
          </span>
          <span className="sr-only">
            Question {position + 1} of {total}
          </span>
        </h1>
        <ProgressBar value={done} max={total} className="flex-1" />
      </div>

      <Card className="flex flex-col gap-5">
        <header className="flex flex-col gap-3">
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-xs uppercase tracking-wider text-ink/60">
                {question.exam.name} <span aria-hidden>/</span> {question.subject.name} <span aria-hidden>/</span>{' '}
                {question.topic.name}
              </p>
              <div ref={toolsRef} className="flex shrink-0 items-center gap-1">
                <span className="mr-1 font-mono text-xs text-ink/50">{question.code}</span>
                <BookmarkButton bookmark={bookmark} code={question.code} />
                <ReportButton
                  signedIn={signedIn}
                  open={reporting}
                  formId={reportFormId}
                  onToggle={() => (reporting ? closeReport() : setReporting(true))}
                />
              </div>
            </div>
            <BookmarkMessage bookmark={bookmark} />
          </div>
          <ul aria-label="About this question" className="flex flex-wrap gap-2">
            {question.subtopic && (
              <li>
                <Tag>{question.subtopic}</Tag>
              </li>
            )}
            <li>
              <Tag tone="ink">{question.difficulty}</Tag>
            </li>
            {question.type === 'pyq' && question.year !== null && (
              <li>
                <Tag>PYQ {question.year}</Tag>
              </li>
            )}
            {question.source && (
              <li>
                <Tag tone="ink">{question.source}</Tag>
              </li>
            )}
          </ul>
          {reporting && (
            <ReportForm id={reportFormId} questionId={question.id} code={question.code} onClose={closeReport} />
          )}
        </header>

        <p className="whitespace-pre-line break-words text-lg leading-relaxed">{question.body}</p>

        <OptionList
          options={question.options}
          selected={outcome ? outcome.selectedIndex : selected}
          onSelect={select}
          answerIndex={outcome ? question.answer_index : undefined}
        />

        {hintShown && question.hint && (
          <div ref={hintRef} tabIndex={-1} className="rounded-lg bg-pen/5 px-4 py-3 outline-none">
            <p className="font-mono text-[0.6875rem] font-medium uppercase tracking-widest text-pen">Hint</p>
            <p className="mt-1 whitespace-pre-line">{question.hint}</p>
          </div>
        )}

        {outcome ? (
          <div className="flex flex-col gap-4">
            <div
              ref={verdictRef}
              tabIndex={-1}
              className={cx('flex items-start gap-3 rounded-lg px-4 py-3 outline-none', verdictStyles[outcome.status])}
            >
              <span className="mt-0.5">{verdictIcons[outcome.status]}</span>
              <div>
                <p className="font-display text-lg font-bold">
                  {outcome.status === 'incorrect'
                    ? `Not this time, the answer is ${optionLetter(question.answer_index)}`
                    : STATUS_LABEL[outcome.status]}
                </p>
                <p className="text-sm text-ink/75">{verdictDetail(outcome, signedIn)}</p>
              </div>
            </div>

            <div className="border-b border-ink/10">
              <Disclosure title="Explanation">
                <p className="whitespace-pre-line">{question.explanation || 'No explanation yet.'}</p>
              </Disclosure>
              {question.formula && (
                <Disclosure title="Formula">
                  <p className="font-bold">{question.formula.name}</p>
                  <FormulaExpression expression={question.formula.expression} className="mt-2" />
                  {question.formula.note && <p className="mt-2 text-sm text-ink/70">{question.formula.note}</p>}
                </Disclosure>
              )}
              <Disclosure title="Similar questions">
                <SimilarList similar={similarQuestions(question, pool)} />
              </Disclosure>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
              <p className="hidden font-mono text-xs text-ink/50 md:block">Enter: {isLast ? 'summary' : 'next'}</p>
              <Button onClick={onNext} className="w-full sm:w-auto">
                {isLast ? 'See summary' : 'Next question'}
              </Button>
            </div>
          </div>
        ) : confirming ? (
          <RevealConfirm onKeepTrying={keepTrying} onReveal={reveal} />
        ) : (
          <div className="flex flex-col gap-3">
            <div
              ref={actionsRef}
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-wrap gap-2">
                {question.hint && !hintShown && (
                  <Button variant="secondary" size="sm" onClick={showHint}>
                    Hint
                  </Button>
                )}
                <Button variant="secondary" size="sm" data-show-answer onClick={() => setConfirming(true)}>
                  Show answer
                </Button>
                <Button variant="ghost" size="sm" onClick={skip}>
                  Skip
                </Button>
              </div>
              <Button onClick={submit} disabled={selected === null} className="w-full sm:w-auto">
                Submit answer
              </Button>
            </div>
            <p className="hidden font-mono text-xs text-ink/50 md:block">
              Keys: {letters} or 1–{question.options.length} to choose · Enter to submit
              {question.hint && !hintShown && ' · H for the hint'}
            </p>
          </div>
        )}
      </Card>
    </article>
  )
}

function verdictDetail({ status, selectedIndex }: Outcome, signedIn: boolean) {
  const points = (s: Verdict) => plural(ATTEMPT_POINTS[s], 'point')
  switch (status) {
    case 'independent':
      return signedIn ? `No hint, no peeking. Worth ${points('independent')}.` : 'No hint, no peeking.'
    case 'hint':
      return signedIn
        ? `Worth ${points('hint')} instead of ${ATTEMPT_POINTS.independent}, as you opened the hint.`
        : 'You opened the hint first.'
    case 'incorrect':
      return `You chose ${optionLetter(selectedIndex ?? 0)}. Read the explanation, then try a similar question.`
    case 'revealed':
      return signedIn
        ? `Worth ${points('revealed')}, and it doesn't count toward your accuracy.`
        : "It doesn't count toward your accuracy."
  }
}

function RevealConfirm({ onKeepTrying, onReveal }: { onKeepTrying: () => void; onReveal: () => void }) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-3 rounded-lg bg-warn/10 px-4 py-3">
      <p id={id} className="text-sm">
        {REVEAL_WARNING}
      </p>
      <div className="flex flex-wrap gap-2">
        {/* The safe choice takes focus. */}
        <Button size="sm" autoFocus onClick={onKeepTrying}>
          Keep trying
        </Button>
        <Button size="sm" variant="secondary" onClick={onReveal}>
          Show the answer
        </Button>
      </div>
    </div>
  )
}

function SimilarList({ similar }: { similar: SimilarQuestion[] }) {
  if (similar.length === 0) return <p className="text-sm text-ink/70">No other questions in this topic yet.</p>
  return (
    <ul className="flex flex-col gap-3">
      {similar.map((q) => (
        <li key={q.id} className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs text-ink/60">
              {q.code} · {q.difficulty}
            </p>
            <p className="line-clamp-2 break-words text-sm">{q.body}</p>
          </div>
          <ButtonLink
            to={`/practice?q=${q.id}`}
            variant="secondary"
            size="sm"
            aria-label={`Try ${q.code}`}
            className="shrink-0"
          >
            Try
          </ButtonLink>
        </li>
      ))}
    </ul>
  )
}
