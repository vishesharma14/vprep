import type { HTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cx } from '../../lib/cx'

const cardClass = 'rounded-xl border border-ink/10 bg-sheet p-5'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(cardClass, className)} {...props} />
}

/** A whole card that is one router link. Lays its children out in a column. */
export function CardLink({ className, ...props }: LinkProps) {
  return (
    <Link
      className={cx(
        cardClass,
        'group flex flex-col transition-colors hover:border-pen/50',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen',
        className,
      )}
      {...props}
    />
  )
}
