import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

type Tone = 'ok' | 'bad' | 'info'

const tones: Record<Tone, string> = {
  ok: 'bg-ok/10 text-ok',
  bad: 'bg-bad/10 text-bad',
  info: 'bg-ink/5 text-ink/80',
}

/** Form-level message. `bad` is announced immediately (role="alert"). */
export function Notice({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <p role={tone === 'bad' ? 'alert' : 'status'} className={cx('rounded-lg px-3 py-2 text-sm', tones[tone])}>
      {children}
    </p>
  )
}
