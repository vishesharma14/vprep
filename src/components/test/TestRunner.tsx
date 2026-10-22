import { useEffect, useId, useRef, useState } from 'react'
import type { PracticeQuestion } from '../../hooks/usePracticeSet'
import { optionLetter } from '../../lib/attempts'
import { cx } from '../../lib/cx'
import { formatClock, plural } from '../../lib/format'
import { saveRunningTest, type RunningTest } from '../../lib/timedTest'
import { OptionList } from '../practice/OptionList'
import { Bubble } from '../ui/Bubble'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ChevronIcon, FlagIcon } from '../ui/Icon'

// Keyboard shortcuts must not fire while typing.
const TYPING = 'input:not([type="radio"]), textarea, select, [contenteditable="true"]'

const isVisible = () => document.visibilityState === 'visible'

function replaceAt<T>(list: T[], index: number, value: T) {
  return list.map((item, i) => (i === index ? value : item))
}

/** `test` with `ms` more time on the question on screen. */
function withTime(test: RunningTest, ms: number): RunningTest {
  if (ms <= 0) return test
  return { ...test, spent: replaceAt(test.spent, test.current, test.spent[test.current] + ms) }
}

type Confirming = 'submit' | 'leave' | null

interface TestRunnerProps {
  title: string
  /** The test as started or resumed. */
  initial: RunningTest
  /** Its questions, in test order. */
  questions: PracticeQuestion[]
  /** Called once, with the final answers and times, on submit or when time runs out. */
  onSubmit: (test: RunningTest, timedOut: boolean) => void
  /** Called once the learner confirms leaving. Nothing is saved. */
  onLeave: () => void
}

/** The test in progress: a countdown, one question at a time and the answer sheet. */
export function TestRunner({ title, initial, questions, onSubmit, onLeave }: TestRunnerProps) {
  const [test, setTest] = useState(initial)
  const [confirming, setConfirming] = useState<Confirming>(null)
  // When timing of the question on screen (re)started; null while the page is hidden.
  const shownAt = useRef<number | null>(null)
  // Submitted or left: the test must not be saved again.
  const over = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)

  const { current, answers, marked, deadline } = test
  const question = questions[current]
  const total = questions.length
  const answered = answers.filter((a) => a !== null).length
  const isLast = current === total - 1

  const elapsed = () => (shownAt.current === null ? 0 : Date.now() - shownAt.current)

  /** Adds the time so far to the question on screen and starts timing afresh. */
  function lap(t: RunningTest) {
    const next = withTime(t, elapsed())
    shownAt.current = isVisible() ? Date.now() : null
    return next
  }

  function finish(timedOut: boolean) {
    if (over.current) return
    over.current = true
    onSubmit(lap(test), timedOut)
  }

  /** Applies a change, unless time ran out before a late timer noticed: then it submits. */
  function update(change: (t: RunningTest) => RunningTest) {
    if (Date.now() >= deadline) return finish(true)
    setTest(change(test))
  }

  const select = (index: number) => update((t) => ({ ...t, answers: replaceAt(t.answers, t.current, index) }))
  const clearChoice = () => update((t) => ({ ...t, answers: replaceAt(t.answers, t.current, null) }))
  const toggleMark = () => update((t) => ({ ...t, marked: replaceAt(t.marked, t.current, !t.marked[t.current]) }))

  function go(index: number) {
    if (index < 0 || index >= total || index === current) return
    update((t) => ({ ...lap(t), current: index }))
  }

  function closeConfirm() {
    const which = confirming
    setConfirming(null)
    requestAnimationFrame(() => actionsRef.current?.querySelector<HTMLElement>(`[data-opens="${which}"]`)?.focus())
  }

  function leave() {
    over.current = true
    onLeave()
  }

  useEffect(() => {
    shownAt.current = isVisible() ? Date.now() : null
  }, [])

  // Saved after every change, so a refresh resumes here.
  useEffect(() => {
    saveRunningTest(test)
    return () => {
      // Following a link away keeps the time on this question too.
      if (!over.current) saveRunningTest(withTime(test, elapsed()))
    }
  }, [test])

  // Each question starts at the top, with focus on its heading.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }, [current])

  // The listeners below are re-subscribed after every render, so they see the latest state.

  // Submits at the deadline. The countdown is worked out from `deadline`, so a
  // background tab that runs this late still ends at the right time.
  useEffect(() => {
    const timer = window.setTimeout(() => finish(true), Math.max(0, deadline - Date.now()))
    return () => window.clearTimeout(timer)
  })

  // A question only gains time while the page is visible.
  useEffect(() => {
    function onVisibilityChange() {
      if (Date.now() >= deadline) return finish(true)
      const next = lap(test)
      setTest(next)
      // A refresh or closing the tab hides the page first; effects may not get to run after.
      if (!isVisible()) saveRunningTest(next)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest(TYPING)) return

      if (e.key === 'Escape' && confirming) {
        closeConfirm()
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        // Also stops a focused option from changing the answer.
        e.preventDefault()
        go(current + (e.key === 'ArrowLeft' ? -1 : 1))
        return
      }
      if (e.key.length !== 1) return
      const index = 'abcdef'.indexOf(e.key.toLowerCase())
      if (index >= 0 && index < question.options.length) {
        e.preventDefault()
        select(index)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <div className="flex flex-col gap-4">
      {/* Below the mobile top bar (h-14); at the very top from md, where there is none. */}
      <header className="sticky top-14 z-10 -mx-4 flex items-center justify-between gap-4 border-b border-ink/10 bg-paper/90 px-4 py-3 backdrop-blur md:top-0 md:-mx-10 md:px-10">
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-bold md:text-xl">{title}</h1>
          <p className="font-mono text-xs text-ink/60">
            {answered} of {total} answered
          </p>
        </div>
        <Countdown deadline={deadline} />
      </header>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-6">
        <Card className="flex flex-col gap-5">
          <header className="flex flex-col gap-1">
            <div className="flex items-start justify-between gap-3">
              <h2 ref={headingRef} tabIndex={-1} className="font-display text-lg font-bold outline-none">
                Question {current + 1} <span className="text-ink/50">of {total}</span>
              </h2>
              <span className="shrink-0 pt-1 font-mono text-xs text-ink/50">{question.code}</span>
            </div>
            <p className="font-mono text-xs uppercase tracking-wider text-ink/60">
              {question.subject.name} <span aria-hidden>/</span> {question.topic.name}
            </p>
          </header>

          <p className="whitespace-pre-line break-words text-lg leading-relaxed">{question.body}</p>

          <OptionList key={question.id} options={question.options} selected={answers[current]} onSelect={select} />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              aria-pressed={marked[current]}
              onClick={toggleMark}
              className="aria-pressed:border-warn aria-pressed:bg-warn/10 aria-pressed:text-warn"
            >
              <FlagIcon className="size-4" />
              Mark for review
            </Button>
            <Button variant="ghost" size="sm" onClick={clearChoice}>
              Clear choice
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-ink/10 pt-4">
            <Button variant="secondary" onClick={() => go(current - 1)} disabled={current === 0}>
              Previous
            </Button>
            <Button onClick={() => (isLast ? setConfirming('submit') : go(current + 1))}>
              {isLast ? 'Save & finish' : 'Save & next'}
            </Button>
          </div>
          <p className="-mt-2 hidden font-mono text-xs text-ink/50 md:block">
            Keys: A–{optionLetter(question.options.length - 1)} to choose · ← → for previous and next
          </p>
        </Card>

        <aside aria-label="Answer sheet" className="lg:sticky lg:top-24">
          <Card className="flex flex-col gap-4">
            <AnswerSheet answers={answers} marked={marked} current={current} onJump={go} />
            <div ref={actionsRef} className="border-t border-ink/10 pt-4">
              {confirming === 'submit' ? (
                <InlineConfirm
                  message={submitMessage(total - answered, marked.filter(Boolean).length)}
                  stay="Keep answering"
                  proceed="Submit test"
                  onStay={closeConfirm}
                  onProceed={() => finish(false)}
                />
              ) : confirming === 'leave' ? (
                <InlineConfirm
                  message="Leave this test? Nothing will be saved."
                  stay="Stay"
                  proceed="Leave test"
                  onStay={closeConfirm}
                  onProceed={leave}
                />
              ) : (
                <div className="flex flex-col gap-2">
                  <Button data-opens="submit" onClick={() => setConfirming('submit')} className="w-full">
                    Submit test
                  </Button>
                  <Button data-opens="leave" variant="ghost" onClick={() => setConfirming('leave')} className="w-full">
                    Leave test
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function submitMessage(unanswered: number, marked: number) {
  const open =
    unanswered === 0
      ? 'Every question is answered.'
      : `${plural(unanswered, 'question')} ${unanswered === 1 ? 'is' : 'are'} unanswered.`
  const review = marked > 0 ? ` ${marked} marked for review.` : ''
  return `${open}${review} Submit now? You can't change your answers after this.`
}

/** mm:ss to the deadline, red in the last minute. */
function Countdown({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [])

  const left = deadline - now
  const low = left < 60_000
  return (
    <div className="shrink-0">
      <p
        role="timer"
        aria-label="Time left"
        className={cx('font-mono text-2xl font-semibold tabular-nums', low ? 'text-bad' : 'text-ink')}
      >
        {formatClock(left)}
      </p>
      {/* A timer isn't read out as it changes; say once when time is nearly up. */}
      <p role="status" className="sr-only">
        {low && left > 0 ? 'Less than a minute left.' : ''}
      </p>
    </div>
  )
}

interface AnswerSheetProps {
  answers: Array<number | null>
  marked: boolean[]
  current: number
  onJump: (index: number) => void
}

/** A bubble per question. Always shown from lg; a collapsible panel below that. */
function AnswerSheet({ answers, marked, current, onJump }: AnswerSheetProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const answered = answers.filter((a) => a !== null).length
  const count = `${answered}/${answers.length}`

  return (
    <div>
      <h2 className="hidden font-bold lg:block">
        Answer sheet <span className="font-mono text-sm font-normal text-ink/60">({count})</span>
      </h2>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'flex w-full items-center justify-between gap-2 rounded py-1 text-left font-bold transition-colors hover:text-pen lg:hidden',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen',
        )}
      >
        Answer sheet ({count})
        <ChevronIcon className={cx('size-4 text-ink/50 transition-transform', open && 'rotate-90')} />
      </button>

      <div id={panelId} className={cx(open ? 'flex' : 'hidden', 'mt-3 flex-col gap-4 lg:flex')}>
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1">
          {answers.map((answer, i) => {
            const status = [answer !== null ? 'answered' : 'not answered', marked[i] && 'marked for review']
              .filter(Boolean)
              .join(', ')
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onJump(i)}
                  aria-current={i === current ? 'step' : undefined}
                  aria-label={`Question ${i + 1}: ${status}`}
                  className="group relative flex h-11 w-full items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-pen"
                >
                  <Bubble
                    label={String(i + 1)}
                    state={answer !== null ? 'filled' : 'empty'}
                    className={cx(i === current && 'ring-2 ring-pen ring-offset-2 ring-offset-sheet')}
                  />
                  {marked[i] && <FlagIcon className="absolute top-0 right-0.5 size-3.5 text-warn" />}
                </button>
              </li>
            )
          })}
        </ol>
        <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink/70">
          <li className="flex items-center gap-1.5">
            <Bubble size="sm" state="filled" /> Answered
          </li>
          <li className="flex items-center gap-1.5">
            <Bubble size="sm" /> Not answered
          </li>
          <li className="flex items-center gap-1.5">
            <Bubble size="sm" className="ring-2 ring-pen ring-offset-1 ring-offset-sheet" /> Current
          </li>
          <li className="flex items-center gap-1.5">
            <FlagIcon className="size-3.5 text-warn" /> Marked
          </li>
        </ul>
      </div>
    </div>
  )
}

interface InlineConfirmProps {
  message: string
  stay: string
  proceed: string
  onStay: () => void
  onProceed: () => void
}

/** Asks before submitting or leaving. The safe choice comes first and takes focus. */
function InlineConfirm({ message, stay, proceed, onStay, onProceed }: InlineConfirmProps) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-3 rounded-lg bg-pen/5 px-4 py-3">
      <p id={id} className="text-sm">
        {message}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" autoFocus onClick={onStay}>
          {stay}
        </Button>
        <Button size="sm" onClick={onProceed}>
          {proceed}
        </Button>
      </div>
    </div>
  )
}
