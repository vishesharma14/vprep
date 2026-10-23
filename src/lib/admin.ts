import { dbErrorMessage, NETWORK_ERROR, SESSION_EXPIRED } from './errors'
import { isAuthRejected, withSessionRecovery } from './session'

/** An error as the Data API reports it. */
export interface DbError {
  code?: string
  message: string
}

/**
 * Admin-only requests are also turned down when the token isn't the admin's
 * (is_admin() is false), which a new JWT may fix.
 */
export const adminRejected = (error: { code?: string; message?: string } | null, status: number) =>
  isAuthRejected(error, status) || !!error?.message?.includes('Admins only')

export type WriteResult<T> = { rows: T[]; error?: undefined } | { rows?: undefined; error: string }

/**
 * Runs an admin's insert, update or delete, getting a new JWT if the database
 * turns the user down. Resolves to the rows it returned, or a message to show:
 * `explain`'s words for the errors it knows, otherwise the database's own.
 * `request` must build a new query each time it is called.
 */
export async function adminWrite<T>(
  request: () => PromiseLike<{ data: unknown; error: DbError | null; status: number }>,
  explain: (error: DbError) => string | null = () => null,
): Promise<WriteResult<T>> {
  try {
    const { data, error, status, expired } = await withSessionRecovery(request)
    if (error) return { error: expired ? SESSION_EXPIRED : (explain(error) ?? dbErrorMessage(error, status)) }
    return { rows: (data ?? []) as T[] }
  } catch {
    return { error: NETWORK_ERROR }
  }
}

/** The name of the constraint a Postgres error message quotes, e.g. "exams_slug_key". */
export function constraintOf(error: DbError) {
  return /constraint "([^"]+)"/.exec(error.message)?.[1] ?? null
}
