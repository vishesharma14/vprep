import type { BetterAuthUser } from '@neondatabase/neon-js/auth/types'
import { neon } from './neon'

// Every Data API request takes its token from the Neon Auth SDK's
// getSession().session.token. The SDK keeps the session in memory until 10 s
// before the JWT's exp, and swaps session.token for a JWT only when the
// /get-session response carries a `set-auth-jwt` header; without a session it
// quietly sends an anonymous token. So the database can be handed a token that
// is not the signed-in user's, while the app still shows them as signed in.

/** Refresh when the JWT has less than this left. */
const MIN_TOKEN_LIFE_MS = 60_000

/**
 * Makes the SDK fetch the session from Neon Auth, which signs a new JWT.
 * X-Force-Fetch skips the SDK's in-memory cache and request sharing (the SDK
 * removes the header before sending); disableCookieCache makes Neon Auth read
 * the session from its database instead of the session_data cookie.
 */
const FORCE_FETCH = {
  query: { disableCookieCache: true },
  fetchOptions: { headers: { 'X-Force-Fetch': 'true' } },
}

/** The SDK's session: `session.token` is what the Data API is sent. */
export interface SessionData {
  session: { token?: string | null }
  user: BetterAuthUser
}

async function getSession(options?: typeof FORCE_FETCH) {
  // getSession() is typed `any` in this beta; data is { session, user } or null.
  const { data, error } = await neon.auth.getSession(options)
  if (error) throw error
  return (data?.session ? data : null) as SessionData | null
}

/** When the JWT expires (ms), or null if `token` isn't a JWT with an exp claim. */
function jwtExpiry(token: string) {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown }
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

function isFresh(token: string | null | undefined) {
  const expires = token ? jwtExpiry(token) : null
  return expires !== null && expires - Date.now() > MIN_TOKEN_LIFE_MS
}

/** In development, logs whether the token is a JWT and when it expires. Never the token. */
function logToken(label: string, token: string | null | undefined) {
  if (!import.meta.env.DEV) return
  const expires = token ? jwtExpiry(token) : null
  console.info(`[vprep auth] ${label}`, {
    jwt: !!token && token.split('.').length === 3,
    expires: expires === null ? null : new Date(expires).toISOString(),
  })
}

let refreshing: Promise<SessionData | null> | null = null

/**
 * The signed-in session, holding a JWT that is good for at least another
 * minute, or null when signed out. Fetches a new session from Neon Auth when
 * the token is missing, isn't a JWT or is about to expire, or when `force` is
 * set. Throws if Neon Auth can't be reached.
 */
export async function ensureFreshSession({ force = false } = {}): Promise<SessionData | null> {
  if (!force) {
    const current = await getSession()
    // The SDK never caches "signed out", so this came from Neon Auth itself.
    if (!current) return null
    logToken('current token', current.session.token)
    if (isFresh(current.session.token)) return current
  }
  // Requests rejected together share one refresh.
  refreshing ??= getSession(FORCE_FETCH).finally(() => {
    refreshing = null
  })
  const fresh = await refreshing
  logToken('new token', fresh?.session.token)
  return fresh
}

interface DbError {
  code?: string
  message?: string
}

/** ensure_profile and my_progress raise these when the database sees no signed-in user. */
const NO_USER = ['Sign in before creating a profile', 'Sign in to see your progress']

/**
 * True when a signed-in request failed because the database didn't accept the
 * user: ensure_profile or my_progress found no user, row-level security or a
 * missing grant blocked a write (42501), the Data API rejected the JWT
 * (PGRST3xx), or 401.
 */
export function isAuthRejected(error: DbError | null | undefined, status?: number) {
  if (!error) return false
  const message = error.message ?? ''
  return (
    status === 401 ||
    error.code === '42501' ||
    /^PGRST3\d\d$/.test(error.code ?? '') ||
    NO_USER.some((text) => message.includes(text))
  )
}

/** What auth_debug() (db/migrations/0003_auth_debug.sql) says about the request's user. */
interface AuthDebug {
  db_role: string
  sub: string | null
  sub_is_uuid: boolean
  resolved_id: string | null
  active_profile: boolean
  error: string | null
  db_time: string
}

async function authDebug() {
  const { data, error, status } = await neon.rpc('auth_debug')
  console.warn('[vprep auth]', error ? { status, code: error.code, message: error.message } : data)
  return error ? null : (data as AuthDebug)
}

let recovering: Promise<AuthDebug | null> | null = null

/** Logs why the database rejected the user, then gets a new JWT. Shared by requests rejected together. */
function recover() {
  recovering ??= (async () => {
    const debug = await authDebug()
    try {
      await ensureFreshSession({ force: true })
    } catch (err) {
      console.warn('[vprep auth] Could not refresh the session', err)
    }
    return debug
  })().finally(() => {
    recovering = null
  })
  return recovering
}

const expiredListeners = new Set<() => void>()

/** Calls `listener` when a signed-in request is still rejected after a new JWT. Returns an unsubscribe function. */
export function onSessionExpired(listener: () => void) {
  expiredListeners.add(listener)
  return () => {
    expiredListeners.delete(listener)
  }
}

type Rejected = (error: DbError | null, status: number) => boolean

/**
 * Runs a signed-in Data API request. If the database rejects the user, logs
 * auth_debug(), gets a new JWT and runs it once more. `expired` is true when
 * that fails too: the learner has to sign in again (listeners are told).
 * `request` must build a new query each time it is called.
 */
export async function withSessionRecovery<R extends { error: DbError | null; status: number }>(
  request: () => PromiseLike<R>,
  rejected: Rejected = isAuthRejected,
): Promise<R & { expired: boolean }> {
  const first = await request()
  if (!rejected(first.error, first.status)) return { ...first, expired: false }

  const debug = await recover()
  const retry = await request()
  // A database that knows the user turned it down for another reason, such as a suspended account.
  const expired = rejected(retry.error, retry.status) && !debug?.resolved_id
  if (expired) {
    console.warn('[vprep auth] Still rejected with a new JWT', { status: retry.status, code: retry.error?.code })
    for (const listener of expiredListeners) listener()
  }
  return { ...retry, expired }
}
