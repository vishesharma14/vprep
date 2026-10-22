import type { AttemptStatus } from '../../types'
import type { TagTone } from '../ui/Tag'

/** Display order: best outcome first. */
export const STATUS_ORDER: AttemptStatus[] = ['independent', 'hint', 'revealed', 'incorrect', 'skipped']

export const STATUS_LABEL: Record<AttemptStatus, string> = {
  independent: 'Solved independently',
  hint: 'Correct, after a hint',
  revealed: 'Answer viewed first',
  incorrect: 'Incorrect',
  skipped: 'Skipped',
}

export const STATUS_TONE: Record<AttemptStatus, TagTone> = {
  independent: 'ok',
  hint: 'pen',
  revealed: 'warn',
  incorrect: 'bad',
  skipped: 'ink',
}

/** Fill for bar segments and legend swatches. */
export const STATUS_FILL: Record<AttemptStatus, string> = {
  independent: 'bg-ok',
  hint: 'bg-pen',
  revealed: 'bg-warn',
  incorrect: 'bg-bad',
  skipped: 'bg-ink/25',
}
