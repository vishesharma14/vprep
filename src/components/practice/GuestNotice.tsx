import { Link, useLocation } from 'react-router-dom'
import { signInHref } from '../../auth/redirect'
import { Notice } from '../ui/Notice'

const WORDING = {
  practice: { doing: "You're practising as a guest.", saves: 'to save your progress.' },
  test: { doing: "You're taking this test as a guest.", saves: 'to save your results.' },
}

/** Tells a signed-out visitor nothing is saved, with a sign-in link that comes back here. */
export function GuestNotice({ activity = 'practice' }: { activity?: keyof typeof WORDING }) {
  const { pathname, search } = useLocation()
  const { doing, saves } = WORDING[activity]
  return (
    <Notice tone="info">
      {doing}{' '}
      <Link
        to={signInHref(pathname + search)}
        className="rounded font-bold text-pen underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-pen"
      >
        Sign in
      </Link>{' '}
      {saves}
    </Notice>
  )
}
