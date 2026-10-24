import { describe, expect, it } from 'vitest'
import { isAuthRejected } from './session'

describe('isAuthRejected', () => {
  it('is false when there is no error', () => {
    expect(isAuthRejected(null)).toBe(false)
    expect(isAuthRejected(undefined)).toBe(false)
    // Status alone says nothing: a request that succeeded has no error.
    expect(isAuthRejected(null, 401)).toBe(false)
  })

  it('is true for a 401', () => {
    expect(isAuthRejected({ message: 'Unauthorized' }, 401)).toBe(true)
  })

  it('is true when row-level security or a grant blocks the request (42501)', () => {
    expect(isAuthRejected({ code: '42501', message: 'new row violates row-level security policy' }, 403)).toBe(true)
  })

  it.each(['PGRST300', 'PGRST301', 'PGRST302', 'PGRST399'])('is true when the Data API rejects the JWT (%s)', (code) => {
    expect(isAuthRejected({ code, message: 'JWT expired' }, 401)).toBe(true)
    expect(isAuthRejected({ code }, 400)).toBe(true)
  })

  it.each(['PGRST116', 'PGRST204', 'PGRST3', 'PGRST3000', 'XPGRST301'])('is false for other Data API errors (%s)', (code) => {
    expect(isAuthRejected({ code, message: 'Something else' }, 400)).toBe(false)
  })

  it('is true when ensure_profile or my_progress sees no signed-in user', () => {
    expect(isAuthRejected({ code: 'P0001', message: 'Sign in before creating a profile' }, 400)).toBe(true)
    expect(isAuthRejected({ code: 'P0001', message: 'Sign in to see your progress' }, 400)).toBe(true)
  })

  it('is false for other database errors', () => {
    expect(isAuthRejected({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409)).toBe(false)
    expect(isAuthRejected({ code: 'P0001', message: 'Admins only' }, 400)).toBe(false)
    expect(isAuthRejected({ message: 'Failed to fetch' }, 0)).toBe(false)
  })

  it('copes with an error that has no code or message', () => {
    expect(isAuthRejected({}, 500)).toBe(false)
  })
})
