import { cx } from '../../lib/cx'

export type BubbleState = 'empty' | 'filled' | 'correct' | 'incorrect'
type Size = 'sm' | 'md' | 'lg'

const states: Record<BubbleState, string> = {
  empty: 'border-ink/40 text-ink/70 group-hover:border-pen group-hover:text-pen',
  filled: 'border-pen bg-pen text-sheet',
  correct: 'border-ok bg-ok text-sheet',
  incorrect: 'border-bad bg-bad text-sheet',
}

const sizes: Record<Size, string> = {
  sm: 'size-3 border-[1.5px]',
  md: 'size-8 border-2 text-sm',
  lg: 'size-10 border-2 text-base',
}

interface BubbleProps {
  /** Option letter, e.g. "A". Omit for a bare mark. */
  label?: string
  state?: BubbleState
  size?: Size
  className?: string
}

/**
 * OMR-style answer circle. Purely visual: put it inside the element that
 * handles the interaction (an option row, an answer-sheet cell, a nav link).
 * Empty bubbles highlight when that parent has the `group` class and is hovered.
 */
export function Bubble({ label, state = 'empty', size = 'md', className }: BubbleProps) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-mono font-semibold leading-none transition-colors',
        states[state],
        sizes[size],
        className,
      )}
    >
      {size !== 'sm' && label}
    </span>
  )
}
