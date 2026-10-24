import { describe, expect, it } from 'vitest'
import type { BookmarkList } from '../types'
import { listNameError } from './useBookmarks'

describe('listNameError', () => {
  const list = (name: string): BookmarkList => ({ id: name, user_id: 'u1', name, created_at: '2026-01-01T00:00:00Z' })
  const lists = [list('Revision'), list('Hard ones')]

  it('accepts a new name', () => {
    expect(listNameError('Formulas to learn', lists)).toBeNull()
  })

  it('asks for a name when blank', () => {
    expect(listNameError('   ', lists)).toBe('Enter a name for the list.')
  })

  it('caps the name at 40 characters, counting characters not UTF-16 units', () => {
    expect(listNameError('x'.repeat(40), lists)).toBeNull()
    expect(listNameError('x'.repeat(41), lists)).toBe('Keep the name to 40 characters or fewer.')
    // 40 emoji are 80 UTF-16 units, but 40 characters to the database.
    expect(listNameError('📘'.repeat(40), lists)).toBeNull()
  })

  it('rejects a name already used, ignoring case and spaces around it', () => {
    expect(listNameError(' revision ', lists)).toBe('You already have a list called "Revision".')
    expect(listNameError('HARD ONES', lists)).toBe('You already have a list called "Hard ones".')
  })
})
