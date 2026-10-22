import { Link, useLocation } from 'react-router-dom'
import { signInHref } from '../../auth/redirect'
import { Notice } from '../ui/Notice'

/** Tells a signed-out visitor nothing is saved, with a sign-in link that comes back here. */
export function GuestNotice() {
  const { pathname, search } = useLocation()
  return (
    <Notice tone="info">
      You're practising as a guest.{' '}
      <Link
        to={signInHref(pathname + search)}
        className="rounded font-bold text-pen underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-pen"
      >
        Sign in
      </Link>{' '}
      to save your progress.
    </Notice>
  )
}
