import { createContext, useContext } from 'react'
import type { BetterAuthUser } from '@neondatabase/neon-js/auth/types'
import type { Profile } from '../types'

// The context lives here, apart from AuthProvider.tsx, so that file exports
// only a component and keeps fast refresh.

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in'

/** The Neon Auth user from the session (the fields the app uses). */
export type AuthUser = Pick<BetterAuthUser, 'id' | 'name' | 'email' | 'emailVerified'>

/** The only profile columns a learner may change; the database rejects the rest. */
export type ProfileChanges = Partial<Pick<Profile, 'full_name' | 'state' | 'daily_goal'>>

export interface SignUpInput {
  name: string
  email: string
  password: string
  /** State or union territory, or null if not chosen. */
  state: string | null
}

export interface SignInInput {
  email: string
  password: string
}

export interface SignUpResult {
  /** Email verification is on: no session until the learner enters the emailed code. Neon Auth has sent it. */
  needsVerification: boolean
}

export interface SignInResult {
  /** The password was right but the email isn't verified yet: no session until it is. No code has been sent. */
  needsVerification: boolean
}

/** A code emailed by Neon Auth (email OTP). */
export interface CodeInput {
  email: string
  code: string
}

export interface ResetPasswordInput extends CodeInput {
  /** The new password. */
  password: string
}

export type AuthState =
  | { status: 'loading' | 'signed-out'; user: null; profile: null; profileError: null }
  | {
      status: 'signed-in'
      user: AuthUser
      /** Null only if ensure_profile failed; `profileError` says why. */
      profile: Profile | null
      profileError: string | null
    }

/**
 * Every function except refreshProfile throws an Error whose message is ready
 * to show to the learner. refreshProfile reports through profileError.
 */
export type AuthContextValue = AuthState & {
  /** Signed in, but the database no longer accepts it, even with a new JWT: sign in again. */
  sessionExpired: boolean
  /** Goes up after each sign-in, so pages can retry what failed while the sign-in had expired. */
  signInCount: number
  signUp: (input: SignUpInput) => Promise<SignUpResult>
  signIn: (input: SignInInput) => Promise<SignInResult>
  /** Emails a new code for verifyEmail; the last one sent is the only one that works. */
  sendVerificationCode: (email: string) => Promise<void>
  /**
   * Verifies the email with its code. `signedIn` is true when Neon Auth also
   * started a session; otherwise sign in with the password.
   */
  verifyEmail: (input: CodeInput) => Promise<{ signedIn: boolean }>
  /** Emails a code for resetPassword. Succeeds whether or not the email has an account. */
  sendPasswordResetCode: (email: string) => Promise<void>
  /** Sets a new password with the emailed code. Doesn't sign in. */
  resetPassword: (input: ResetPasswordInput) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (changes: ProfileChanges) => Promise<void>
  refreshProfile: () => Promise<void>
  /** Hides the "sign-in has expired" dialog until a request is rejected again. */
  dismissSessionExpired: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth() must be used inside <AuthProvider>.')
  return value
}
