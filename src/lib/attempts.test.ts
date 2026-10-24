import { describe, expect, it } from 'vitest'
import type { AttemptStatus } from '../types'
import { answerStatus, isCorrect, isGraded, optionLetter } from './attempts'

const ALL: AttemptStatus[] = ['independent', 'hint', 'revealed', 'incorrect', 'skipped']

describe('optionLetter', () => {
  it('names options A, B, C…', () => {
    expect([0, 1, 2, 3, 4, 5].map(optionLetter).join('')).toBe('ABCDEF')
  })
})

describe('isCorrect and isGraded', () => {
  it('count independent and hint as correct', () => {
    expect(ALL.filter(isCorrect)).toEqual(['independent', 'hint'])
  })

  it('grade correct and incorrect answers only, leaving out revealed and skipped', () => {
    expect(ALL.filter(isGraded)).toEqual(['independent', 'hint', 'incorrect'])
  })
})

describe('answerStatus', () => {
  it('is independent for the right option with no hint', () => {
    expect(answerStatus(2, 2, false)).toBe('independent')
  })

  it('is hint for the right option after the hint', () => {
    expect(answerStatus(2, 2, true)).toBe('hint')
  })

  it('is incorrect for a wrong option, hint or not', () => {
    expect(answerStatus(1, 2, false)).toBe('incorrect')
    expect(answerStatus(1, 2, true)).toBe('incorrect')
  })
})
