import { describe, expect, it } from 'vitest'
import { safeNext, signInHref } from './redirect'

describe('signInHref', () => {
  it('returns to the page after signing in', () => {
    expect(signInHref('/progress')).toBe('/account?next=%2Fprogress')
    expect(signInHref('/practice?topic=t1&q=2')).toBe('/account?next=%2Fpractice%3Ftopic%3Dt1%26q%3D2')
  })

  it('needs no return for Home or the account page itself', () => {
    expect(signInHref('/')).toBe('/account')
    expect(signInHref('/account')).toBe('/account')
    expect(signInHref('/account?next=%2Fprogress')).toBe('/account')
  })
})

describe('safeNext', () => {
  const ORIGIN = 'https://vprep.test'
  const nextParam = (href: string) => new URL(href, ORIGIN).searchParams.get('next')

  it('goes to a path on this site', () => {
    expect(safeNext('/progress', ORIGIN)).toBe('/progress')
    expect(safeNext('/practice?topic=t1', ORIGIN)).toBe('/practice?topic=t1')
    expect(safeNext('/formulas#area', ORIGIN)).toBe('/formulas#area')
  })

  it('reads back what signInHref sent', () => {
    expect(safeNext(nextParam(signInHref('/practice?topic=t1&q=2')), ORIGIN)).toBe('/practice?topic=t1&q=2')
  })

  it('goes Home when there is nowhere to go', () => {
    expect(safeNext(null, ORIGIN)).toBe('/')
    expect(safeNext('', ORIGIN)).toBe('/')
  })

  it.each([
    'https://evil.example',
    'javascript:alert(1)',
    'evil.example',
    '//evil.example',
    '/\\evil.example',
    // The browser drops tabs and newlines and reads \ as /, so each is //evil.example.
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r\n/evil.example',
    '\t//evil.example',
    '/\\\\evil.example',
    '/\t\\evil.example',
    // On this site, but the path that's left, //evil.example, is not.
    '/.//evil.example',
    '/..//evil.example',
    '/%2e%2e//evil.example',
    // Not a valid address once read.
    '/\\[',
  ])('never leaves the site for %j', (next) => {
    expect(safeNext(next, ORIGIN)).toBe('/')
  })

  it.each(['%2F%09%2Fevil.example', '%2F%0A%2Fevil.example', '%2F%5Cevil.example', '%2F%2Fevil.example'])(
    'never leaves the site for ?next=%s',
    (encoded) => {
      expect(safeNext(nextParam(`/account?next=${encoded}`), ORIGIN)).toBe('/')
    },
  )

  // Still encoded after ?next= is read: the browser keeps these as a path here.
  it.each(['/%2F%2Fevil.example', '/%5Cevil.example', '/%09/evil.example', '/%0A/evil.example'])(
    'keeps %j on this site',
    (next) => {
      const path = safeNext(next, ORIGIN)
      expect(path).toBe(next)
      expect(new URL(path, ORIGIN).origin).toBe(ORIGIN)
    },
  )

  it('never goes back to the account page', () => {
    expect(safeNext('/account', ORIGIN)).toBe('/')
    expect(safeNext('/account?next=%2F', ORIGIN)).toBe('/')
    expect(safeNext('/./account', ORIGIN)).toBe('/')
  })
})
