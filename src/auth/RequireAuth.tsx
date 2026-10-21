import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { signInHref } from './redirect'
import { useAuth } from './useAuth'

interface RequireAuthProps {
  /** Page title, still shown when the page itself is blocked. */
  title: string
  /** Shown to signed-out visitors, e.g. "Sign in to see your revision". */
  signInMessage?: string
  /** Only active admins may see the page. */
  admin?: boolean
  children: ReactNode
}

/** Renders the page only for signed-in learners (or admins); otherwise explains why. */
export function RequireAuth({
  title,
  signInMessage = 'Sign in to see this page',
  admin = false,
  children,
}: RequireAuthProps) {
  const auth = useAuth()
  const { pathname, search } = useLocation()

  if (auth.status === 'loading') return null

  const signedIn = auth.status === 'signed-in'
  // Mirrors is_admin() in the database, which ignores suspended admins.
  const allowed = admin
    ? auth.profile?.role === 'admin' && !auth.profile.is_suspended
    : signedIn
  if (allowed) return <>{children}</>

  return (
    <>
      <PageHeader title={title} />
      <Card className="flex max-w-md flex-col items-start gap-4">
        <p>{admin ? 'This page is for admins.' : signInMessage}</p>
        {!signedIn && <ButtonLink to={signInHref(pathname + search)}>Sign in</ButtonLink>}
      </Card>
    </>
  )
}
