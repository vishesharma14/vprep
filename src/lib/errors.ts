export const NETWORK_ERROR = "Can't reach the server. Check your internet connection and try again."

export const SESSION_EXPIRED = 'Your sign-in has expired. Please sign in again.'

/** postgrest-js reports a request that never reached the server as status 0. */
export function dbErrorMessage(error: { message: string }, status: number) {
  return status === 0 ? NETWORK_ERROR : error.message
}
