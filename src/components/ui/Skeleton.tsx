import { cx } from '../../lib/cx'

/** Grey placeholder block shown while data loads. Size it with className. */
export function Skeleton({ className, circle = false }: { className?: string; circle?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        'block bg-ink/10 motion-safe:animate-pulse',
        circle ? 'rounded-full' : 'rounded-md',
        className,
      )}
    />
  )
}

/** Tells screen readers what is loading; pair it with Skeleton blocks. */
export function LoadingLabel({ children }: { children: string }) {
  return (
    <p role="status" className="sr-only">
      {children}
    </p>
  )
}
