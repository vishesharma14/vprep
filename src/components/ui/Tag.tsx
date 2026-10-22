import type { HTMLAttributes } from 'react'
import { cx } from '../../lib/cx'

export type TagTone = 'drop' | 'pen' | 'ok' | 'bad' | 'warn' | 'ink'

const tones: Record<TagTone, string> = {
  drop: 'bg-drop/10 text-drop',
  pen: 'bg-pen/10 text-pen',
  ok: 'bg-ok/10 text-ok',
  bad: 'bg-bad/10 text-bad',
  warn: 'bg-warn/10 text-warn',
  ink: 'bg-ink/5 text-ink/70',
}

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: TagTone
}

/** Small mono label, e.g. a subject, difficulty or attempt status. */
export function Tag({ tone = 'drop', className, ...props }: TagProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium uppercase tracking-wider',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}
