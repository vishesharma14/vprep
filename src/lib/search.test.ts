import { describe, expect, it } from 'vitest'
import { matchesEveryWord, searchWords } from './search'

describe('searchWords', () => {
  it('lowercases and splits on any whitespace', () => {
    expect(searchWords(' GATE  scheduling\tRound-Robin ')).toEqual(['gate', 'scheduling', 'round-robin'])
  })

  it('is empty for a blank search', () => {
    expect(searchWords('   ')).toEqual([])
    expect(searchWords('')).toEqual([])
  })
})

describe('matchesEveryWord', () => {
  const fields = ['Round robin scheduling', null, 'GATE CSE']

  it('needs every word, in any field, ignoring case', () => {
    expect(matchesEveryWord(fields, ['gate', 'robin'])).toBe(true)
    expect(matchesEveryWord(fields, ['gate', 'paging'])).toBe(false)
  })

  it('matches part of a word', () => {
    expect(matchesEveryWord(fields, ['sched'])).toBe(true)
  })

  it('matches anything with no words', () => {
    expect(matchesEveryWord(fields, [])).toBe(true)
  })
})
