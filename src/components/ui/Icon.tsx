import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

/** 20px stroke icon in the current text colour. Decorative: label the control, not the icon. */
function Icon({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx('size-5 shrink-0', className)}
    >
      {children}
    </svg>
  )
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </Icon>
  )
}

export function CrossIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
    </Icon>
  )
}

export function EyeIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M1.75 10S5 4.25 10 4.25 18.25 10 18.25 10 15 15.75 10 15.75 1.75 10 1.75 10z" />
      <circle cx="10" cy="10" r="2.5" />
    </Icon>
  )
}

export function ChevronIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M7.5 5l5 5-5 5" />
    </Icon>
  )
}
