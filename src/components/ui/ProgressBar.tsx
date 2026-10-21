import { cx } from '../../lib/cx'

/**
 * Thin bar showing value out of max. Purely visual: always put the numbers
 * in text next to it (e.g. "3 of 12 attempted").
 */
export function ProgressBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <span aria-hidden className={cx('block h-1.5 overflow-hidden rounded-full bg-ink/10', className)}>
      <span className="block h-full rounded-full bg-pen" style={{ width: `${percent}%` }} />
    </span>
  )
}
