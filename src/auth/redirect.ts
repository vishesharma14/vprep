/** Link to the account page that returns to `path` after signing in. */
export function signInHref(path: string) {
  return path === '/' || path.startsWith('/account')
    ? '/account'
    : `/account?next=${encodeURIComponent(path)}`
}

/**
 * Where to go after signing in. Only same-site paths are allowed, so a
 * crafted ?next= link can't send someone to another website.
 */
export function safeNext(next: string | null) {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/'
  return next.startsWith('/account') ? '/' : next
}
