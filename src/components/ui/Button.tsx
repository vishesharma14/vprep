import type { ButtonHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cx } from '../../lib/cx'

type Variant = 'primary' | 'secondary' | 'ghost'
/** `icon`: a square for one icon; give it an aria-label. */
type Size = 'sm' | 'md' | 'icon'

const variants: Record<Variant, string> = {
  primary: 'bg-pen text-sheet hover:bg-pen/90',
  secondary: 'border border-ink/15 bg-sheet text-ink hover:border-pen hover:text-pen',
  ghost: 'text-pen hover:bg-pen/10',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-11 px-5 text-base',
  icon: 'size-8',
}

const buttonClass = (variant: Variant, size: Size, className?: string) =>
  cx(
    'inline-flex items-center justify-center gap-2 rounded-lg font-bold transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen',
    'disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  )

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />
}

interface ButtonLinkProps extends LinkProps {
  variant?: Variant
  size?: Size
}

/** A router link that looks like a Button. */
export function ButtonLink({ variant = 'primary', size = 'md', className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClass(variant, size, className)} {...props} />
}
