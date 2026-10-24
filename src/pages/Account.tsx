import {
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { safeNext } from '../auth/redirect'
import { useAuth } from '../auth/useAuth'
import { RegionSelect } from '../components/account/RegionSelect'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { TextField } from '../components/ui/Field'
import { Notice } from '../components/ui/Notice'
import { Tag } from '../components/ui/Tag'
import { useCooldown } from '../hooks/useCooldown'
import { cx } from '../lib/cx'
import type { Profile } from '../types'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 8
const MAX_NAME = 80
/** Digits in the codes Neon Auth emails. */
const CODE_LENGTH = 6
/** Wait before another code can be sent. */
const RESEND_SECONDS = 60

type FieldErrors<K extends string> = Partial<Record<K, string>>

const hasErrors = (errors: object) => Object.keys(errors).length > 0

const messageOf = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong. Please try again.'

/** Moves focus to the first field marked invalid, once React has rendered the errors. */
function focusFirstInvalid(form: HTMLFormElement) {
  requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
}

function nameError(name: string) {
  if (!name) return 'Enter your full name.'
  if (name.length > MAX_NAME) return `Use ${MAX_NAME} characters or fewer.`
}

function passwordError(password: string) {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`
}

function codeError(code: string) {
  if (code.length !== CODE_LENGTH) return `Enter the ${CODE_LENGTH}-digit code from the email.`
}

export function Account() {
  const { status } = useAuth()
  return (
    <>
      <PageHeader title="Account" />
      {status === 'signed-out' && <AuthForms />}
      {status === 'signed-in' && <SignedIn />}
    </>
  )
}

// ---------------------------------------------------------------------
// Signed out: "Sign in" and "Create account" tabs, and the screens that
// take an emailed code (verify the email, reset the password)
// ---------------------------------------------------------------------

type Tab = 'sign-in' | 'create'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'sign-in', label: 'Sign in' },
  { id: 'create', label: 'Create account' },
]

/** An email to verify before signing in. The password stays in memory only, to sign in afterwards. */
interface Verification {
  email: string
  password: string
  /** Why the first code couldn't be sent, or null if it was. */
  sendError: string | null
}

/** A screen shown in place of the tabs. */
type Flow = ({ kind: 'verify'; from: Tab } & Verification) | { kind: 'reset' }

function AuthForms() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>('sign-in')
  // Shared, so switching tabs keeps what was typed.
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [flow, setFlow] = useState<Flow | null>(null)
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})
  const id = useId()

  const goNext = () => navigate(safeNext(params.get('next')), { replace: true })

  function selectTab(next: Tab, focus = false) {
    setTab(next)
    setNotice(null)
    if (focus) tabRefs.current[next]?.focus()
  }

  // Left and right arrows move between tabs (WAI-ARIA tabs pattern).
  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const index = TABS.findIndex((t) => t.id === tab)
    selectTab(TABS[(index + step + TABS.length) % TABS.length].id, true)
  }

  function startFlow(next: Flow) {
    setNotice(null)
    setFlow(next)
  }

  /** Leaves a flow for the `target` tab, with focus on its email field. */
  function backTo(target: Tab, message: string | null = null) {
    setFlow(null)
    setTab(target)
    setNotice(message)
    requestAnimationFrame(() =>
      document
        .getElementById(`${id}-panel-${target}`)
        ?.querySelector<HTMLInputElement>('input[type="email"]')
        ?.focus(),
    )
  }

  const verify = (from: Tab) => (verification: Verification) => startFlow({ kind: 'verify', from, ...verification })

  return (
    <Card className="max-w-md">
      {flow?.kind === 'verify' && (
        <VerifyEmail
          email={flow.email}
          password={flow.password}
          sendError={flow.sendError}
          onSignedIn={goNext}
          onVerified={() => backTo('sign-in', 'Your email is verified. Sign in to continue.')}
          onUseDifferentEmail={() => backTo(flow.from)}
        />
      )}
      {flow?.kind === 'reset' && (
        <ResetPassword
          email={email}
          onEmailChange={setEmail}
          onSignedIn={goNext}
          onBack={(message) => backTo('sign-in', message)}
        />
      )}

      {/* Hidden rather than removed during a flow, so the forms keep what was typed. */}
      <div hidden={flow !== null}>
        <div
          role="tablist"
          aria-label="Sign in or create an account"
          className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-ink/5 p-1"
        >
          {TABS.map((t) => {
            const selected = t.id === tab
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el
                }}
                type="button"
                role="tab"
                id={`${id}-tab-${t.id}`}
                aria-selected={selected}
                aria-controls={`${id}-panel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(t.id)}
                onKeyDown={onTabKeyDown}
                className={cx(
                  'rounded-md px-3 py-2 text-sm font-bold transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen',
                  selected ? 'bg-sheet text-pen shadow-sm' : 'text-ink/70 hover:text-ink',
                )}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {notice && (
          <div className="mb-4">
            <Notice tone="ok">{notice}</Notice>
          </div>
        )}

        {TABS.map((t) => (
          <div
            key={t.id}
            role="tabpanel"
            id={`${id}-panel-${t.id}`}
            aria-labelledby={`${id}-tab-${t.id}`}
            hidden={t.id !== tab}
          >
            {t.id === 'sign-in' ? (
              <SignInForm
                email={email}
                onEmailChange={setEmail}
                onSignedIn={goNext}
                onNeedsVerification={verify('sign-in')}
                onForgotPassword={() => startFlow({ kind: 'reset' })}
              />
            ) : (
              <SignUpForm
                email={email}
                onEmailChange={setEmail}
                onSignedIn={goNext}
                onNeedsVerification={verify('create')}
              />
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

interface AuthFormProps {
  email: string
  onEmailChange: (email: string) => void
  onSignedIn: () => void
  /** Email verification is on and the email isn't verified yet: ask for the code. */
  onNeedsVerification: (verification: Verification) => void
}

function SignInForm({
  email,
  onEmailChange,
  onSignedIn,
  onNeedsVerification,
  onForgotPassword,
}: AuthFormProps & { onForgotPassword: () => void }) {
  const { signIn, sendVerificationCode } = useAuth()
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors<'email' | 'password'>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const address = email.trim()
    const found: FieldErrors<'email' | 'password'> = {}
    if (!EMAIL_PATTERN.test(address)) found.email = 'Enter your email address, like name@example.com.'
    if (!password) found.password = 'Enter your password.'
    setErrors(found)
    setFormError(null)
    if (hasErrors(found)) return focusFirstInvalid(form)

    setBusy(true)
    try {
      const { needsVerification } = await signIn({ email: address, password })
      if (!needsVerification) return onSignedIn()
    } catch (err) {
      setFormError(messageOf(err))
      setBusy(false)
      return
    }

    // Right password, unverified email. Signing in sends no code, so send one.
    let sendError: string | null = null
    try {
      await sendVerificationCode(address)
    } catch (err) {
      sendError = messageOf(err)
    }
    setBusy(false)
    onNeedsVerification({ email: address, password, sendError })
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {formError && <Notice tone="bad">{formError}</Notice>}
      <TextField
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        error={errors.email}
      />
      <TextField
        label="Password"
        type="password"
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
      />
      <Button type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
      <LinkButton onClick={onForgotPassword}>Forgot password?</LinkButton>
    </form>
  )
}

type SignUpField = 'name' | 'email' | 'password'

function SignUpForm({ email, onEmailChange, onSignedIn, onNeedsVerification }: AuthFormProps) {
  const { signUp } = useAuth()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [region, setRegion] = useState('')
  const [errors, setErrors] = useState<FieldErrors<SignUpField>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const trimmedName = name.trim()
    const address = email.trim()
    const found: FieldErrors<SignUpField> = {}
    const badName = nameError(trimmedName)
    if (badName) found.name = badName
    if (!EMAIL_PATTERN.test(address)) found.email = 'Enter a valid email address, like name@example.com.'
    const badPassword = passwordError(password)
    if (badPassword) found.password = badPassword
    setErrors(found)
    setFormError(null)
    if (hasErrors(found)) return focusFirstInvalid(form)

    setBusy(true)
    try {
      const { needsVerification } = await signUp({
        name: trimmedName,
        email: address,
        password,
        state: region || null,
      })
      if (!needsVerification) return onSignedIn()
      setBusy(false)
      // Neon Auth has emailed the first code itself.
      onNeedsVerification({ email: address, password, sendError: null })
    } catch (err) {
      setFormError(messageOf(err))
      setBusy(false)
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {formError && <Notice tone="bad">{formError}</Notice>}
      <TextField
        label="Full name"
        name="name"
        autoComplete="name"
        maxLength={MAX_NAME}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
      />
      <TextField
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        error={errors.email}
      />
      <TextField
        label="Password"
        type="password"
        name="new-password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint={`At least ${MIN_PASSWORD} characters.`}
        error={errors.password}
      />
      <RegionSelect
        value={region}
        onChange={(e) => setRegion(e.target.value)}
        optional
        hint="Used for state leaderboards."
      />
      <Button type="submit" disabled={busy}>
        {busy ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  )
}

/**
 * "Enter the code we sent": verifies the email, then signs in (with the
 * session Neon Auth starts, or else the password) and carries on like the
 * sign-in form.
 */
function VerifyEmail({
  email,
  password,
  sendError,
  onSignedIn,
  onVerified,
  onUseDifferentEmail,
}: Verification & {
  onSignedIn: () => void
  /** Verified, but signing in failed: the learner signs in on the form. */
  onVerified: () => void
  onUseDifferentEmail: () => void
}) {
  const { verifyEmail, signIn, sendVerificationCode } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [formError, setFormError] = useState<string | null>(sendError && `We couldn't send a code. ${sendError}`)
  const [resent, setResent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const found = codeError(code)
    setError(found)
    setFormError(null)
    setResent(false)
    if (found) return focusFirstInvalid(form)

    setBusy(true)
    try {
      const { signedIn } = await verifyEmail({ email, code })
      if (signedIn) return onSignedIn()
    } catch (err) {
      setFormError(messageOf(err))
      setBusy(false)
      return
    }

    // The code is used up, so from here on any problem goes back to the sign-in form.
    try {
      const { needsVerification } = await signIn({ email, password })
      if (!needsVerification) return onSignedIn()
    } catch {
      // The sign-in form shows the error if it happens again.
    }
    onVerified()
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">Check your email</h2>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        {formError && <Notice tone="bad">{formError}</Notice>}
        {resent && <Notice tone="ok">We've sent a new code to {email}.</Notice>}
        <CodeField value={code} onChange={setCode} hint={`Enter the code we sent to ${email}.`} error={error} />
        <Button type="submit" disabled={busy}>
          {busy ? 'Verifying…' : 'Verify email'}
        </Button>
      </form>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <ResendCode
          send={() => sendVerificationCode(email)}
          sentAlready={sendError === null}
          onResult={(err) => {
            setFormError(err)
            setResent(err === null)
          }}
        />
        <LinkButton onClick={onUseDifferentEmail}>Use a different email</LinkButton>
      </div>
    </div>
  )
}

/** "Forgot password?": emails a code, then sets a new password with it and signs in. */
function ResetPassword({
  email,
  onEmailChange,
  onSignedIn,
  onBack,
}: {
  email: string
  onEmailChange: (email: string) => void
  onSignedIn: () => void
  /** Back to the sign-in form, with a message to show there. */
  onBack: (message?: string) => void
}) {
  // Where the code went; null until it is sent.
  const [sentTo, setSentTo] = useState<string | null>(null)
  return sentTo === null ? (
    <RequestResetCode email={email} onEmailChange={onEmailChange} onSent={setSentTo} onBack={() => onBack()} />
  ) : (
    <SetNewPassword
      email={sentTo}
      onSignedIn={onSignedIn}
      onUseDifferentEmail={() => setSentTo(null)}
      onChanged={() => onBack('Your password has been changed. Sign in with your new password.')}
    />
  )
}

function RequestResetCode({
  email,
  onEmailChange,
  onSent,
  onBack,
}: {
  email: string
  onEmailChange: (email: string) => void
  onSent: (email: string) => void
  onBack: () => void
}) {
  const { sendPasswordResetCode } = useAuth()
  const [error, setError] = useState<string>()
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const address = email.trim()
    const found = EMAIL_PATTERN.test(address) ? undefined : 'Enter your email address, like name@example.com.'
    setError(found)
    setFormError(null)
    if (found) return focusFirstInvalid(form)

    setBusy(true)
    try {
      await sendPasswordResetCode(address)
      onSent(address)
    } catch (err) {
      setFormError(messageOf(err))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">Reset your password</h2>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        {formError && <Notice tone="bad">{formError}</Notice>}
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          hint="We'll email you a code to set a new password."
          error={error}
        />
        <Button type="submit" disabled={busy}>
          {busy ? 'Sending code…' : 'Send code'}
        </Button>
      </form>
      <LinkButton onClick={onBack}>Back to sign in</LinkButton>
    </div>
  )
}

type ResetField = 'code' | 'password' | 'confirm'

function SetNewPassword({
  email,
  onSignedIn,
  onUseDifferentEmail,
  onChanged,
}: {
  email: string
  onSignedIn: () => void
  onUseDifferentEmail: () => void
  /** Changed, but signing in with it failed: the learner signs in on the form. */
  onChanged: () => void
}) {
  const { resetPassword, signIn, sendPasswordResetCode } = useAuth()
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<FieldErrors<ResetField>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const found: FieldErrors<ResetField> = {}
    const badCode = codeError(code)
    if (badCode) found.code = badCode
    const badPassword = passwordError(password)
    if (badPassword) found.password = badPassword
    if (!confirm) found.confirm = 'Enter the new password again.'
    else if (confirm !== password) found.confirm = "The passwords don't match."
    setErrors(found)
    setFormError(null)
    if (hasErrors(found)) return focusFirstInvalid(form)

    setBusy(true)
    try {
      await resetPassword({ email, code, password })
    } catch (err) {
      setFormError(messageOf(err))
      setBusy(false)
      return
    }

    try {
      const { needsVerification } = await signIn({ email, password })
      if (!needsVerification) return onSignedIn()
    } catch {
      // The sign-in form shows the error if it happens again.
    }
    onChanged()
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">Set a new password</h2>
      {/* Worded so it doesn't reveal whether the email has an account. */}
      <Notice tone="ok">
        If an account exists for {email}, we've sent {resent ? 'a new code' : 'a code'}.
      </Notice>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        {formError && <Notice tone="bad">{formError}</Notice>}
        <CodeField
          value={code}
          onChange={setCode}
          hint={`The ${CODE_LENGTH}-digit code from the email.`}
          error={errors.code}
        />
        <TextField
          label="New password"
          type="password"
          name="new-password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={`At least ${MIN_PASSWORD} characters.`}
          error={errors.password}
        />
        <TextField
          label="Confirm new password"
          type="password"
          name="confirm-password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />
        <Button type="submit" disabled={busy}>
          {busy ? 'Setting password…' : 'Set password'}
        </Button>
      </form>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <ResendCode
          send={() => sendPasswordResetCode(email)}
          sentAlready
          onResult={(err) => {
            setFormError(err)
            if (err === null) setResent(true)
          }}
        />
        <LinkButton onClick={onUseDifferentEmail}>Use a different email</LinkButton>
      </div>
    </div>
  )
}

/** The emailed code. Takes focus when shown, and keeps digits only, so a pasted "123 456" works. */
function CodeField({
  value,
  onChange,
  hint,
  error,
}: {
  value: string
  onChange: (code: string) => void
  hint: string
  error?: string
}) {
  return (
    <TextField
      label="Code"
      name="code"
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
      hint={hint}
      error={error}
    />
  )
}

/**
 * "Resend code", available RESEND_SECONDS after the last code (at once if
 * none was sent). `onResult` gets null when a code went out, or the error.
 */
function ResendCode({
  send,
  sentAlready,
  onResult,
}: {
  send: () => Promise<void>
  sentAlready: boolean
  onResult: (error: string | null) => void
}) {
  const cooldown = useCooldown(RESEND_SECONDS, sentAlready)
  const [sending, setSending] = useState(false)
  const waiting = sending || cooldown.remaining > 0

  async function resend() {
    if (waiting) return
    setSending(true)
    try {
      await send()
      cooldown.start()
      onResult(null)
    } catch (err) {
      onResult(messageOf(err))
    } finally {
      setSending(false)
    }
  }

  // aria-disabled rather than disabled, so focus stays on the button while it waits.
  return (
    <LinkButton aria-disabled={waiting} onClick={resend}>
      {sending ? 'Sending…' : cooldown.remaining > 0 ? `Resend code in ${cooldown.remaining}s` : 'Resend code'}
    </LinkButton>
  )
}

/** A button that looks like a text link, for the smaller actions around a form. */
function LinkButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cx(
        'self-start rounded text-sm font-bold text-pen underline-offset-4 hover:underline',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen',
        'aria-disabled:cursor-default aria-disabled:text-ink/60 aria-disabled:hover:no-underline',
        className,
      )}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------
// Signed in: profile, email and sign out
// ---------------------------------------------------------------------

function SignedIn() {
  const auth = useAuth()
  if (auth.status !== 'signed-in') return null
  const { user, profile, profileError } = auth

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <Card className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold">{profile?.full_name || user.name}</h2>
          {profile?.role === 'admin' && <Tag>Admin</Tag>}
        </div>
        {profile ? (
          <ProfileForm key={profile.id} profile={profile} />
        ) : (
          <ProfileUnavailable message={profileError} />
        )}
      </Card>

      <Card className="flex flex-col gap-5">
        <h2 className="text-xl font-bold">Sign-in details</h2>
        <TextField
          label="Email"
          type="email"
          value={user.email}
          readOnly
          hint="You sign in with this email. It can't be changed here."
        />
        <SignOutButton />
      </Card>
    </div>
  )
}

type ProfileField = 'fullName' | 'dailyGoal'

function ProfileForm({ profile }: { profile: Profile }) {
  const { updateProfile } = useAuth()
  const [fullName, setFullName] = useState(profile.full_name)
  const [region, setRegion] = useState(profile.state ?? '')
  const [dailyGoal, setDailyGoal] = useState(String(profile.daily_goal))
  const [errors, setErrors] = useState<FieldErrors<ProfileField>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Any edit hides the last "Saved" confirmation.
  const bind =
    (set: (value: string) => void) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      set(e.target.value)
      setSaved(false)
    }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const name = fullName.trim()
    const goal = Number(dailyGoal)
    const found: FieldErrors<ProfileField> = {}
    const badName = nameError(name)
    if (badName) found.fullName = badName
    if (!Number.isInteger(goal) || goal < 1 || goal > 200) {
      found.dailyGoal = 'Enter a whole number from 1 to 200.'
    }
    setErrors(found)
    setFormError(null)
    setSaved(false)
    if (hasErrors(found)) return focusFirstInvalid(form)

    setSaving(true)
    try {
      await updateProfile({ full_name: name, state: region || null, daily_goal: goal })
      setFullName(name)
      setSaved(true)
    } catch (err) {
      setFormError(messageOf(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {formError && <Notice tone="bad">{formError}</Notice>}
      <TextField
        label="Full name"
        name="name"
        autoComplete="name"
        maxLength={MAX_NAME}
        value={fullName}
        onChange={bind(setFullName)}
        error={errors.fullName}
      />
      <RegionSelect value={region} onChange={bind(setRegion)} optional hint="Used for state leaderboards." />
      <TextField
        label="Daily goal"
        type="number"
        name="daily-goal"
        inputMode="numeric"
        min={1}
        max={200}
        step={1}
        value={dailyGoal}
        onChange={bind(setDailyGoal)}
        hint="Questions to answer each day, from 1 to 200."
        error={errors.dailyGoal}
      />
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
        <p role="status" className="text-sm font-bold text-ok">
          {saved && 'Saved'}
        </p>
      </div>
    </form>
  )
}

function ProfileUnavailable({ message }: { message: string | null }) {
  const { refreshProfile } = useAuth()
  const [busy, setBusy] = useState(false)

  async function retry() {
    setBusy(true)
    await refreshProfile()
    setBusy(false)
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <Notice tone="bad">Couldn't load your profile{message ? `: ${message}` : '.'}</Notice>
      <Button variant="secondary" onClick={retry} disabled={busy}>
        {busy ? 'Trying again…' : 'Try again'}
      </Button>
    </div>
  )
}

function SignOutButton() {
  const { signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignOut() {
    setBusy(true)
    setError(null)
    try {
      await signOut()
    } catch (err) {
      setError(messageOf(err))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      {error && <Notice tone="bad">{error}</Notice>}
      <Button variant="secondary" onClick={handleSignOut} disabled={busy}>
        {busy ? 'Signing out…' : 'Sign out'}
      </Button>
    </div>
  )
}
