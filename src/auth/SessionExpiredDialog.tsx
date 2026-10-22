import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/Field'
import { Notice } from '../components/ui/Notice'
import { useAuth } from './useAuth'

const messageOf = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong. Please try again.'

/**
 * Asks the learner to sign in again, over whatever page they are on, once the
 * database stops accepting their sign-in. The page stays mounted, so a
 * practice session carries on afterwards.
 */
export function SessionExpiredDialog() {
  const auth = useAuth()
  if (auth.status !== 'signed-in' || !auth.sessionExpired) return null
  return <ExpiredDialog email={auth.user.email} />
}

function ExpiredDialog({ email }: { email: string }) {
  const { signIn, signOut, dismissSessionExpired } = useAuth()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string>()
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'sign-in' | 'sign-out' | null>(null)
  const id = useId()

  const focusPassword = () => dialogRef.current?.querySelector<HTMLInputElement>('input[name="password"]')?.focus()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    // showModal() focuses the first field, which is the read-only email.
    focusPassword()
  }, [])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)
    if (!password) {
      setPasswordError('Enter your password.')
      return focusPassword()
    }
    setPasswordError(undefined)
    setBusy('sign-in')
    try {
      // Closes the dialog once signed in.
      await signIn({ email, password })
    } catch (err) {
      setFormError(messageOf(err))
      setBusy(null)
    }
  }

  async function handleSignOut() {
    setFormError(null)
    setBusy('sign-out')
    try {
      await signOut()
    } catch (err) {
      setFormError(messageOf(err))
      setBusy(null)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-text`}
      // Escape closes it; the next rejected request opens it again.
      onClose={dismissSessionExpired}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-ink/10 bg-sheet p-6 text-ink shadow-xl backdrop:bg-ink/40"
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-title`} className="text-xl font-bold">
            Your sign-in has expired.
          </h2>
          <p id={`${id}-text`} className="text-ink/70">
            Please sign in again. You'll stay on this page, and answers that weren't saved will be saved.
          </p>
        </div>
        {formError && <Notice tone="bad">{formError}</Notice>}
        <TextField label="Email" type="email" name="email" autoComplete="username" value={email} readOnly />
        <TextField
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={passwordError}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy !== null}>
            {busy === 'sign-in' ? 'Signing in…' : 'Sign in'}
          </Button>
          <Button variant="ghost" onClick={handleSignOut} disabled={busy !== null}>
            {busy === 'sign-out' ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
