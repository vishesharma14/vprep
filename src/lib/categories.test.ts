import { describe, expect, it } from 'vitest'
import { CATEGORIES, categoryLabel, isExamCategory } from './categories'

describe('categoryLabel', () => {
  it('labels each category', () => {
    expect(CATEGORIES.map((c) => categoryLabel(c.id))).toEqual([
      'Government',
      'Engineering',
      'Medical',
      'Placement',
      'Certification',
    ])
  })
})

describe('isExamCategory', () => {
  it('accepts only known categories from the URL', () => {
    expect(isExamCategory('medical')).toBe(true)
    expect(isExamCategory('Medical')).toBe(false)
    expect(isExamCategory('sports')).toBe(false)
    expect(isExamCategory('')).toBe(false)
    expect(isExamCategory(null)).toBe(false)
  })
})
