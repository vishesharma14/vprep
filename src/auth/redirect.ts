/** Link to the account page that returns to `path` after signing in. */
export function signInHref(path: string) {
  return path === '/' || path.startsWith('/account')
    ? '/account'
    : `/account?next=${encodeURIComponent(path)}`
}

/**
 * Where to go after signing in. Only same-site paths are allowed, so a
 * crafted ?next= link can't send someone to another website. `next` is read
 * against `origin` the way the browser reads it (tabs and newlines dropped,
 * \ taken as /), and the path returned is the one that was checked.
 */
export function safeNext(next: string | null, origin = window.location.origin) {
  if (!next?.startsWith('/')) return '/'
  let url: URL
  try {
    url = new URL(next, origin)
  } catch {
    return '/'
  }
  const path = url.pathname + url.search + url.hash
  // The path must lead back here too: '/.//evil.example' is on this site,
  // but its path, '//evil.example', is not.
  if (url.origin !== origin || new URL(path, origin).href !== url.href) return '/'
  return path.startsWith('/account') ? '/' : path
}
