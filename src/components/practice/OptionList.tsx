import { useId } from 'react'
import { optionLetter } from '../../lib/attempts'
import { cx } from '../../lib/cx'
import { Bubble, type BubbleState } from '../ui/Bubble'
import { CheckIcon, CrossIcon } from '../ui/Icon'

interface OptionListProps {
  options: string[]
  /** The option picked so far; once answered, the learner's answer (null if none). */
  selected: number | null
  onSelect: (index: number) => void
  /** Given once the question is answered or revealed: marks the right answer and locks the choice. */
  answerIndex?: number
}

/** Answer options as OMR rows: a bubble per option, filled in pen when chosen. */
export function OptionList({ options, selected, onSelect, answerIndex }: OptionListProps) {
  const name = useId()
  const locked = answerIndex !== undefined

  return (
    // min-w-0: a fieldset otherwise refuses to shrink below its widest word.
    <fieldset className="min-w-0">
      <legend className="sr-only">Options</legend>
      <ul className="flex flex-col gap-2">
        {options.map((text, i) => {
          const chosen = selected === i
          const correct = locked && i === answerIndex
          const wrong = locked && chosen && !correct
          const bubble: BubbleState = correct ? 'correct' : wrong ? 'incorrect' : chosen ? 'filled' : 'empty'

          return (
            <li key={i}>
              <label
                className={cx(
                  'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-pen',
                  correct
                    ? 'border-ok bg-ok/5'
                    : wrong
                      ? 'border-bad bg-bad/5'
                      : chosen
                        ? 'border-pen bg-pen/5'
                        : locked
                          ? 'border-ink/10 text-ink/60'
                          : 'group cursor-pointer border-ink/15 bg-sheet hover:border-pen/60',
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={i}
                  checked={chosen}
                  disabled={locked}
                  onChange={() => onSelect(i)}
                  className="sr-only"
                />
                <Bubble label={optionLetter(i)} state={bubble} />
                <span className="min-w-0 flex-1 whitespace-pre-line break-words pt-1">{text}</span>
                {correct && (
                  <>
                    <CheckIcon className="mt-1.5 text-ok" />
                    <span className="sr-only">{chosen ? 'Your answer, correct' : 'Correct answer'}</span>
                  </>
                )}
                {wrong && (
                  <>
                    <CrossIcon className="mt-1.5 text-bad" />
                    <span className="sr-only">Your answer, incorrect</span>
                  </>
                )}
              </label>
            </li>
          )
        })}
      </ul>
    </fieldset>
  )
}
