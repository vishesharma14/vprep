import { describe, expect, it } from 'vitest'
import { followName, SLUG_PATTERN, slugError, slugify } from './slug'

describe('slugify', () => {
  it('lowercases and joins words with single dashes', () => {
    expect(slugify('Profit & Loss')).toBe('profit-loss')
    expect(slugify('SSC  CGL')).toBe('ssc-cgl')
  })

  it('keeps digits', () => {
    expect(slugify('GATE CSE 2026')).toBe('gate-cse-2026')
  })

  it('drops accents', () => {
    expect(slugify('Café Résumé')).toBe('cafe-resume')
  })

  it('trims dashes from both ends', () => {
    expect(slugify('  (Time & Work)  ')).toBe('time-work')
  })

  it('is empty when there are no letters or digits', () => {
    expect(slugify('&&&')).toBe('')
    expect(slugify('')).toBe('')
  })

  it('always gives a slug the database accepts, unless empty', () => {
    for (const name of ['Profit & Loss', 'Café', ' a--b ', 'Ratio: 1/2', 'C++ & Java']) {
      expect(slugify(name)).toMatch(SLUG_PATTERN)
    }
  })
})

describe('followName', () => {
  it('follows the name while the slug still matches the old name', () => {
    expect(followName('profit-loss', 'Profit & Loss', 'Profit, Loss & Discount')).toBe('profit-loss-discount')
  })

  it('follows from an empty form', () => {
    expect(followName('', '', 'Algebra')).toBe('algebra')
  })

  it('keeps a slug that was edited by hand', () => {
    expect(followName('pl', 'Profit & Loss', 'Profit and Loss')).toBe('pl')
  })
})

describe('slugError', () => {
  const taken = ['ssc-cgl', 'gate-cse']

  it('asks for a slug when empty', () => {
    expect(slugError('', taken, 'Taken.')).toBe('Add a slug, made of lowercase letters and digits.')
  })

  it.each(['Upper', 'two  words', 'double--dash', '-leading', 'trailing-', 'under_score'])(
    'rejects %j',
    (slug) => {
      expect(slugError(slug, taken, 'Taken.')).toBe(
        'Use only lowercase letters and digits, with single dashes between words.',
      )
    },
  )

  it('rejects a slug already in use, with the given message', () => {
    expect(slugError('gate-cse', taken, 'Another exam already uses this slug.')).toBe(
      'Another exam already uses this slug.',
    )
  })

  it('accepts a new, well-formed slug', () => {
    expect(slugError('jee-main', taken, 'Taken.')).toBeUndefined()
  })
})
