import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { BetterAuthUser } from '@neondatabase/neon-js/auth/types'
import { dbErrorMessage, NETWORK_ERROR, SESSION_EXPIRED } from '../lib/errors'
import { neon } from '../lib/neon'
import { ensureFreshSession, isAuthRejected, onSessionExpired, withSessionRecovery } from '../lib/session'
import type { Profile } from '../types'
import {
  AuthContext,
  type AuthContextValue,
  type AuthState,
  type AuthUser,
  type CodeInput,
  type ProfileChanges,
  type ResetPasswordInput,
  type SignInInput,
  type SignUpInput,
} from './useAuth'

const LOADING: AuthState = { status: 'loading', user: null, profile: null, profileError: null }
const SIGNED_OUT: AuthState = { status: 'signed-out', user: null, profile: null, profileError: null }

const NO_SESSION =
  "You're signed in, but the browser didn't keep the session. Allow cookies for this site and try again."

/** A tab hidden this long may come back with a JWT near expiry, or a session that has ended. */
const LONG_HIDDEN_MS = 5 * 60_000

/** Holds the Neon Auth session and the learner's profile. Read it with useAuth(). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(LOADING)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [signInCount, setSignInCount] = useState(0)
  // Bumped whenever the signed-in user may change, so a slow request that
  // started earlier can't overwrite newer state.
  const generation = useRef(0)

  useEffect(() => onSessionExpired(() => setSessionExpired(true)), [])

  /**
   * Reads the session (from Neon Auth when `force` is set) and, if there is
   * one, loads the profile. Resolves to true when signed in.
   */
  const syncSession = useCallback(
    async ({ force = false, chosenState }: { force?: boolean; chosenState?: string | null } = {}) => {
      const current = ++generation.current
      const session = await ensureFreshSession({ force })
      const user = session ? toAuthUser(session.user) : null
      const next: AuthState = user
        ? { status: 'signed-in', user, ...(await loadProfile(user, chosenState)) }
        : SIGNED_OUT
      if (current === generation.current) setState(next)
      return user !== null
    },
    [],
  )

  useEffect(() => {
    syncSession().catch((err: unknown) => {
      console.error('Could not read the Neon Auth session', err)
      setState((s) => (s.status === 'loading' ? SIGNED_OUT : s))
    })
  }, [syncSession])

  // Check the JWT when the learner comes back, before they try to save anything.
  useEffect(() => {
    let hiddenAt: number | null = null
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hiddenAt ??= Date.now()
        return
      }
      const longHidden = hiddenAt !== null && Date.now() - hiddenAt >= LONG_HIDDEN_MS
      hiddenAt = null
      if (!longHidden) return
      ensureFreshSession().then(
        (session) => {
          // The session ended while the tab was away. Only shown if the app still has them signed in.
          if (!session) setSessionExpired(true)
        },
        (err: unknown) => console.warn('[vprep auth] Could not check the session', err),
      )
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  const signUp = useCallback(
    (input: SignUpInput) =>
      withFriendlyErrors(async () => {
        unwrap(
          await neon.auth.signUp.email({ name: input.name, email: input.email, password: input.password }),
        )
        // A new sign-in replaces an expired one; the profile load sets it again if still rejected.
        setSessionExpired(false)
        if (await syncSession({ force: true, chosenState: input.state })) return { needsVerification: false }
        savePendingState(input.email, input.state)
        return { needsVerification: true }
      }),
    [syncSession],
  )

  /** Loads the session Neon Auth has just started, and the profile. */
  const finishSignIn = useCallback(async () => {
    setSessionExpired(false)
    // The SDK may still hold the old session; fetch the new one so requests carry its JWT.
    if (!(await syncSession({ force: true }))) throw new Error(NO_SESSION)
    setSignInCount((n) => n + 1)
  }, [syncSession])

  const signIn = useCallback(
    (input: SignInInput) =>
      withFriendlyErrors(async () => {
        try {
          unwrap(await neon.auth.signIn.email({ email: input.email, password: input.password }))
        } catch (err) {
          if (isEmailNotVerified(err)) return { needsVerification: true }
          throw err
        }
        await finishSignIn()
        return { needsVerification: false }
      }),
    [finishSignIn],
  )

  const verifyEmail = useCallback(
    (input: CodeInput) =>
      withFriendlyErrors(async () => {
        const { data } = unwrap(await neon.auth.emailOtp.verifyEmail({ email: input.email, otp: input.code }))
        // The code is used up now, so a session that can't be read isn't an error:
        // the caller signs in with the password instead.
        if (!data?.token) return { signedIn: false }
        return finishSignIn().then(
          () => ({ signedIn: true }),
          () => ({ signedIn: false }),
        )
      }),
    [finishSignIn],
  )

  const signOut = useCallback(
    () =>
      withFriendlyErrors(async () => {
        unwrap(await neon.auth.signOut())
        generation.current++
        setState(SIGNED_OUT)
      }),
    [],
  )

  const profileId = state.profile?.id
  const updateProfile = useCallback(
    async (changes: ProfileChanges) => {
      if (!profileId) throw new Error('Sign in to update your profile.')
      const { data, error, status, expired } = await withSessionRecovery(
        () => neon.from('profiles').update(changes).eq('id', profileId).select().single(),
        // Row-level security hides the row from a user the database doesn't
        // recognise, so the update matches nothing and .single() fails (PGRST116).
        (error, status) => isAuthRejected(error, status) || error?.code === 'PGRST116',
      )
      if (error) throw new Error(expired ? SESSION_EXPIRED : dbErrorMessage(error, status))
      const profile = data as Profile
      setState((s) =>
        s.status === 'signed-in' && s.user.id === profile.id ? { ...s, profile, profileError: null } : s,
      )
    },
    [profileId],
  )

  const user = state.user
  const refreshProfile = useCallback(async () => {
    if (!user) return
    const current = generation.current
    const result = await loadProfile(user)
    if (current === generation.current) {
      setState((s) => (s.status === 'signed-in' ? { ...s, ...result } : s))
    }
  }, [user])

  const dismissSessionExpired = useCallback(() => setSessionExpired(false), [])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      // Signing in again (or up) clears it; until then, guests never see it.
      sessionExpired: state.status === 'signed-in' && sessionExpired,
      signInCount,
      signUp,
      signIn,
      sendVerificationCode,
      verifyEmail,
      sendPasswordResetCode,
      resetPassword,
      signOut,
      updateProfile,
      refreshProfile,
      dismissSessionExpired,
    }),
    [
      state,
      sessionExpired,
      signInCount,
      signUp,
      signIn,
      verifyEmail,
      signOut,
      updateProfile,
      refreshProfile,
      dismissSessionExpired,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Email codes (Better Auth's email-otp plugin). They change nothing in the
// app's state, so they live outside the component.

const sendVerificationCode = (email: string) =>
  withFriendlyErrors(async () => {
    unwrap(await neon.auth.emailOtp.sendVerificationOtp({ email, type: 'email-verification' }))
  })

const sendPasswordResetCode = (email: string) =>
  withFriendlyErrors(async () => {
    // Neon Auth answers the same whether or not the email has an account.
    unwrap(await neon.auth.emailOtp.sendVerificationOtp({ email, type: 'forget-password' }))
  })

const resetPassword = (input: ResetPasswordInput) =>
  withFriendlyErrors(async () => {
    unwrap(await neon.auth.emailOtp.resetPassword({ email: input.email, otp: input.code, password: input.password }))
  })

function toAuthUser(user: BetterAuthUser): AuthUser {
  return { id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified }
}

/** ensure_profile creates the profile on first sign-in and returns it every time. */
async function loadProfile(
  user: AuthUser,
  chosenState?: string | null,
): Promise<{ profile: Profile | null; profileError: string | null }> {
  const pState = chosenState || readPendingState(user.email)
  const { data, error, status, expired } = await withSessionRecovery(() =>
    neon.rpc('ensure_profile', { p_state: pState || null }),
  )
  if (error) return { profile: null, profileError: expired ? SESSION_EXPIRED : dbErrorMessage(error, status) }
  clearPendingState(user.email)
  return { profile: data as Profile, profileError: null }
}

// With email verification on, sign-up returns no session, so the profile can
// only be created at the first sign-in. The chosen state waits here until then.
const pendingStateKey = (email: string) => `vprep:pending-state:${email.trim().toLowerCase()}`

function savePendingState(email: string, state: string | null) {
  if (!state) return
  try {
    localStorage.setItem(pendingStateKey(email), state)
  } catch {
    // Storage unavailable: the learner can still set it on the account page.
  }
}

function readPendingState(email: string) {
  try {
    return localStorage.getItem(pendingStateKey(email))
  } catch {
    return null
  }
}

function clearPendingState(email: string) {
  try {
    localStorage.removeItem(pendingStateKey(email))
  } catch {
    // Nothing to clear.
  }
}

/** Better Auth calls resolve to { data, error } when they don't throw. */
function unwrap<T extends { error: unknown }>(result: T) {
  if (result.error) throw result.error
  return result
}

async function withFriendlyErrors<T>(task: () => Promise<T>) {
  try {
    return await task()
  } catch (err) {
    throw new Error(authErrorMessage(err), { cause: err })
  }
}

/**
 * Neon Auth rejects failed requests with an AuthApiError carrying a snake_case
 * `code`; Better Auth's own codes are SCREAMING_CASE. Both are handled, as a
 * lower-case code.
 */
function errorCode(err: unknown) {
  const { code } = (err ?? {}) as { code?: unknown }
  return typeof code === 'string' ? code.toLowerCase() : ''
}

/**
 * Sign-in with the right password while email verification is on and the
 * email isn't verified. Better Auth answers 403 EMAIL_NOT_VERIFIED, which the
 * SDK turns into email_not_confirmed (status 422).
 */
function isEmailNotVerified(err: unknown) {
  const c = errorCode(err)
  return c === 'email_not_confirmed' || c === 'email_not_verified'
}

function authErrorMessage(err: unknown) {
  // fetch() rejects with a TypeError when the request never reached the server.
  if (err instanceof TypeError) return NETWORK_ERROR
  const { status, message } = (err ?? {}) as { status?: unknown; message?: unknown }
  const c = errorCode(err)
  const text = typeof message === 'string' ? message : ''

  if (c === 'invalid_credentials' || c === 'invalid_email_or_password' || c === 'invalid_password') {
    return 'Wrong email or password.'
  }
  if (c.startsWith('user_already_exists') || c === 'email_exists' || /already (exists|registered)/i.test(text)) {
    return 'An account with this email already exists. Sign in instead.'
  }
  if (isEmailNotVerified(err)) return 'Verify your email first (check your inbox), then sign in.'
  if (c === 'weak_password' || c.startsWith('password_too')) {
    return 'Choose a stronger password of at least 8 characters.'
  }
  if (c === 'email_address_invalid' || c === 'invalid_email') return 'Enter a valid email address.'
  if (status === 429) return 'Too many attempts. Wait a minute, then try again.'
  // Email codes. The SDK has no codes of its own for these, so it passes on
  // only Better Auth's message ("Invalid OTP", "OTP expired", "Too many attempts").
  if (c === 'invalid_otp' || /invalid otp/i.test(text)) {
    return "That code isn't right. Check it against the most recent email and try again."
  }
  if (c === 'otp_expired' || /otp expired/i.test(text)) {
    return 'That code has expired. Select "Resend code" to get a new one.'
  }
  if (c === 'too_many_attempts' || /too many attempts/i.test(text)) {
    return 'Too many wrong codes. Select "Resend code" to get a new one.'
  }
  return text || 'Something went wrong. Please try again.'
}
