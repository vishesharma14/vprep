import { describe, expect, it } from 'vitest'
import type { AdminQuestionDifficultyRow } from '../types'
import { dataSaysLabel, difficultySummary, levelTable, mismatches, needsAnswersNote } from './difficulty'

const FITTED_AT = '2026-10-25T16:00:00+00:00'

let next = 1001
function row(fields: Partial<AdminQuestionDifficultyRow>): AdminQuestionDifficultyRow {
  const code = `Q${next++}`
  return {
    question_id: `id-${code}`,
    code,
    body: 'A question',
    status: 'published',
    topic_name: 'Percentages',
    exam_name: 'SSC CGL',
    set_level: 'medium',
    estimated_level: null,
    difficulty: null,
    std_error: null,
    responses: null,
    correct_rate: null,
    p_average: null,
    fitted_at: null,
    ...fields,
  }
}

/** A fitted question with a level, from the chance an average learner gets it right. */
const fitted = (set_level: AdminQuestionDifficultyRow['set_level'], p_average: number, fields = {}) =>
  row({
    set_level,
    p_average,
    estimated_level: p_average >= 0.7 ? 'easy' : p_average < 0.4 ? 'hard' : 'medium',
    responses: 30,
    fitted_at: FITTED_AT,
    ...fields,
  })

describe('dataSaysLabel', () => {
  it('shows the level and the answers behind it', () => {
    expect(dataSaysLabel({ estimated_level: 'hard', responses: 40 })).toBe('Hard · 40 answers')
    expect(dataSaysLabel({ estimated_level: 'easy', responses: 20 })).toBe('Easy · 20 answers')
  })

  it('is null without a level, or without a row', () => {
    expect(dataSaysLabel({ estimated_level: null, responses: 11 })).toBeNull()
    expect(dataSaysLabel(undefined)).toBeNull()
  })
})

describe('needsAnswersNote', () => {
  it('says how many first answers a level needs, and how many there are', () => {
    expect(needsAnswersNote(null)).toBe('Needs 20 first answers')
    expect(needsAnswersNote(0)).toBe('Needs 20 first answers')
    expect(needsAnswersNote(11)).toBe('Needs 20 first answers (has 11)')
  })
})

describe('levelTable', () => {
  it('counts questions by level set and level estimated', () => {
    const table = levelTable([
      fitted('easy', 0.8),
      fitted('easy', 0.2),
      fitted('hard', 0.2),
      row({ set_level: 'easy' }),
      row({ set_level: 'medium', responses: 11, fitted_at: FITTED_AT }),
    ])
    expect(table).toEqual({
      easy: { easy: 1, medium: 0, hard: 1, none: 1 },
      medium: { easy: 0, medium: 0, hard: 0, none: 1 },
      hard: { easy: 0, medium: 0, hard: 1, none: 0 },
    })
  })
})

describe('mismatches', () => {
  it('leaves out matches and questions without a level', () => {
    expect(mismatches([fitted('easy', 0.9), fitted('hard', 0.1), row({ set_level: 'easy' })])).toEqual([])
  })

  it('puts two levels apart first, then the furthest outside the set level', () => {
    const slightlyHard = fitted('medium', 0.38)
    const veryHard = fitted('medium', 0.1)
    const easyButHard = fitted('easy', 0.35)
    const hardButEasy = fitted('hard', 0.8)
    const found = mismatches([slightlyHard, veryHard, easyButHard, hardButEasy])

    expect(found.map((m) => m.row.code)).toEqual([hardButEasy.code, easyButHard.code, veryHard.code, slightlyHard.code])
    expect(found.map((m) => m.gap)).toEqual([2, 2, 1, 1])
    // Easy starts at 0.7; hard ends at 0.4; medium covers 0.4 to 0.7.
    expect(found[0].distance).toBeCloseTo(0.4)
    expect(found[1].distance).toBeCloseTo(0.35)
    expect(found[2].distance).toBeCloseTo(0.3)
    expect(found[3].distance).toBeCloseTo(0.02)
  })

  it('breaks ties by code, Q999 before Q1000', () => {
    const later = fitted('easy', 0.5, { code: 'Q1000' })
    const earlier = fitted('easy', 0.5, { code: 'Q999' })
    expect(mismatches([later, earlier]).map((m) => m.row.code)).toEqual(['Q999', 'Q1000'])
  })

  it('names the estimated level', () => {
    expect(mismatches([fitted('easy', 0.2)])[0].estimated).toBe('hard')
  })
})

describe('difficultySummary', () => {
  it('has nothing before the first fit', () => {
    expect(difficultySummary([row({}), row({})])).toEqual({
      fitted: 0,
      withLevel: 0,
      firstAnswers: 0,
      fittedAt: null,
    })
  })

  it('counts fitted questions, levels and first answers', () => {
    const summary = difficultySummary([
      fitted('easy', 0.8, { responses: 25 }),
      row({ responses: 11, fitted_at: FITTED_AT }),
      row({}),
    ])
    expect(summary).toEqual({ fitted: 2, withLevel: 1, firstAnswers: 36, fittedAt: FITTED_AT })
  })

  it('takes the latest fit time', () => {
    const earlier = '2026-10-20T09:00:00+00:00'
    expect(difficultySummary([row({ fitted_at: FITTED_AT }), row({ fitted_at: earlier })]).fittedAt).toBe(FITTED_AT)
  })
})
