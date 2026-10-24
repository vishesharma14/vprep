import { describe, expect, it } from 'vitest'
import { adminRejected, constraintOf } from './admin'
import { dbErrorMessage, NETWORK_ERROR } from './errors'

describe('constraintOf', () => {
  it('reads the constraint name a Postgres message quotes', () => {
    expect(constraintOf({ message: 'duplicate key value violates unique constraint "exams_slug_key"' })).toBe(
      'exams_slug_key',
    )
  })

  it('is null when the message names no constraint', () => {
    expect(constraintOf({ message: 'permission denied for table exams' })).toBeNull()
  })
})

describe('adminRejected', () => {
  it('is true when is_admin() turned the request down', () => {
    expect(adminRejected({ code: 'P0001', message: 'Admins only' }, 400)).toBe(true)
  })

  it('is true whenever the user was rejected', () => {
    expect(adminRejected({ code: '42501', message: 'permission denied' }, 403)).toBe(true)
  })

  it('is false for other errors and for no error', () => {
    expect(adminRejected({ code: '23505', message: 'duplicate key' }, 409)).toBe(false)
    expect(adminRejected(null, 200)).toBe(false)
  })
})

describe('dbErrorMessage', () => {
  it("shows the database's message", () => {
    expect(dbErrorMessage({ message: 'Admins only' }, 400)).toBe('Admins only')
  })

  it('says the server could not be reached for status 0', () => {
    expect(dbErrorMessage({ message: 'TypeError: Failed to fetch' }, 0)).toBe(NETWORK_ERROR)
  })
})
