import type { HTMLAttributes } from 'react'
import { cx } from '../../lib/cx'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-xl border border-ink/10 bg-sheet p-5', className)} {...props} />
  )
}
