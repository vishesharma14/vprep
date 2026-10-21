import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

/** Form-level message. `bad` is announced immediately (role="alert"). */
export function Notice({ tone, children }: { tone: 'ok' | 'bad'; children: ReactNode }) {
  return (
    <p
      role={tone === 'bad' ? 'alert' : 'status'}
      className={cx('rounded-lg px-3 py-2 text-sm', tone === 'bad' ? 'bg-bad/10 text-bad' : 'bg-ok/10 text-ok')}
    >
      {children}
    </p>
  )
}
