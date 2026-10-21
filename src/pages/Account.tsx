import { useId, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { safeNext } from '../auth/redirect'
import { useAuth } from '../auth/useAuth'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { SelectField, TextField } from '../components/ui/Field'
import { Notice } from '../components/ui/Notice'
import { Tag } from '../components/ui/Tag'
import { cx } from '../lib/cx'
import { STATES, UNION_TERRITORIES } from '../lib/regions'
import type { Profile } from '../types'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 8
const MAX_NAME = 80
const VERIFY_EMAIL = 'Check your email to verify your account, then sign in.'

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
// Signed out: "Sign in" and "Create account" tabs
// ---------------------------------------------------------------------

type Tab = 'sign-in' | 'create'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'sign-in', label: 'Sign in' },
  { id: 'create', label: 'Create account' },
]

function AuthForms() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>('sign-in')
  // Shared, so switching tabs keeps what was typed.
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
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

  function onNeedsVerification() {
    selectTab('sign-in', true)
    setNotice(VERIFY_EMAIL)
  }

  return (
    <Card className="max-w-md">
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
            <SignInForm email={email} onEmailChange={setEmail} onSignedIn={goNext} />
          ) : (
            <SignUpForm
              email={email}
              onEmailChange={setEmail}
              onSignedIn={goNext}
              onNeedsVerification={onNeedsVerification}
            />
          )}
        </div>
      ))}
    </Card>
  )
}

interface AuthFormProps {
  email: string
  onEmailChange: (email: string) => void
  onSignedIn: () => void
}

function SignInForm({ email, onEmailChange, onSignedIn }: AuthFormProps) {
  const { signIn } = useAuth()
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors<'email' | 'password'>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const found: FieldErrors<'email' | 'password'> = {}
    if (!EMAIL_PATTERN.test(email.trim())) found.email = 'Enter your email address, like name@example.com.'
    if (!password) found.password = 'Enter your password.'
    setErrors(found)
    setFormError(null)
    if (hasErrors(found)) return focusFirstInvalid(form)

    setBusy(true)
    try {
      await signIn({ email: email.trim(), password })
      onSignedIn()
    } catch (err) {
      setFormError(messageOf(err))
      setBusy(false)
    }
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
    </form>
  )
}

type SignUpField = 'name' | 'email' | 'password'

function SignUpForm({
  email,
  onEmailChange,
  onSignedIn,
  onNeedsVerification,
}: AuthFormProps & { onNeedsVerification: () => void }) {
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
    const found: FieldErrors<SignUpField> = {}
    const badName = nameError(trimmedName)
    if (badName) found.name = badName
    if (!EMAIL_PATTERN.test(email.trim())) found.email = 'Enter a valid email address, like name@example.com.'
    if (password.length < MIN_PASSWORD) found.password = `Use at least ${MIN_PASSWORD} characters.`
    setErrors(found)
    setFormError(null)
    if (hasErrors(found)) return focusFirstInvalid(form)

    setBusy(true)
    try {
      const { needsVerification } = await signUp({
        name: trimmedName,
        email: email.trim(),
        password,
        state: region || null,
      })
      if (!needsVerification) return onSignedIn()
      setPassword('')
      setBusy(false)
      onNeedsVerification()
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
      <RegionSelect value={region} onChange={(e) => setRegion(e.target.value)} />
      <Button type="submit" disabled={busy}>
        {busy ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  )
}

function RegionSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void
}) {
  return (
    <SelectField
      label="State / UT"
      name="state"
      optional
      value={value}
      onChange={onChange}
      hint="Used for state leaderboards."
    >
      <option value="">Not selected</option>
      <optgroup label="States">
        {STATES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </optgroup>
      <optgroup label="Union territories">
        {UNION_TERRITORIES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </optgroup>
    </SelectField>
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
      <RegionSelect value={region} onChange={bind(setRegion)} />
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
