import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { signInHref } from '../../auth/redirect'
import { ButtonLink } from '../ui/Button'

/** For signed-out visitors, in place of an icon button: signs in and comes back here. */
export function SignInIconLink({ label, children }: { label: string; children: ReactNode }) {
  const { pathname, search } = useLocation()
  return (
    <ButtonLink to={signInHref(pathname + search)} variant="ghost" size="icon" aria-label={label} title={label}>
      {children}
    </ButtonLink>
  )
}
