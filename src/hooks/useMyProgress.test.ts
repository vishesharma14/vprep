import { describe, expect, it } from 'vitest'
import { totals } from '../test/fixtures'
import { ATTEMPT_POINTS } from '../types'
import { notListedMessage } from './useLeaderboard'
import { hasLeaderboardPoints, independentPercent, totalsAccuracy } from './useMyProgress'

describe('ATTEMPT_POINTS', () => {
  it('matches attempt_points() in the SQL', () => {
    expect(ATTEMPT_POINTS).toEqual({ independent: 10, hint: 6, revealed: 1, incorrect: 0, skipped: 0 })
  })
})

describe('hasLeaderboardPoints', () => {
  it('is false before any attempt', () => {
    expect(hasLeaderboardPoints(totals())).toBe(false)
  })

  it('is false when every attempt was wrong or skipped, as they earn 0 points', () => {
    expect(hasLeaderboardPoints(totals({ attempts: 5, incorrect: 3, skipped: 2 }))).toBe(false)
  })

  it.each(['independent', 'hint', 'revealed'] as const)('is true after one %s attempt', (status) => {
    expect(hasLeaderboardPoints(totals({ attempts: 1, [status]: 1 }))).toBe(true)
  })
})

describe('notListedMessage', () => {
  it('says how to join before any points', () => {
    expect(notListedMessage(totals({ attempts: 2, incorrect: 2 }))).toBe(
      'Answer a question correctly to join the leaderboard.',
    )
  })

  it('says the learner is outside the top 500 once they have points', () => {
    expect(notListedMessage(totals({ attempts: 1, independent: 1 }))).toBe(
      "You're not in the top 500 yet. Keep practising.",
    )
  })
})

describe('totalsAccuracy', () => {
  it('is correct (independent + hint) out of graded (correct + incorrect)', () => {
    // 3 + 1 correct out of 3 + 1 + 1 graded; revealed and skipped are left out.
    const t = totals({ attempts: 12, independent: 3, hint: 1, incorrect: 1, revealed: 5, skipped: 2 })
    expect(totalsAccuracy(t)).toBe(80)
  })

  it('rounds to a whole percentage', () => {
    expect(totalsAccuracy(totals({ attempts: 3, independent: 2, incorrect: 1 }))).toBe(67)
    expect(totalsAccuracy(totals({ attempts: 3, independent: 1, incorrect: 2 }))).toBe(33)
  })

  it('is null before any graded answer', () => {
    expect(totalsAccuracy(totals())).toBeNull()
    expect(totalsAccuracy(totals({ attempts: 3, revealed: 2, skipped: 1 }))).toBeNull()
  })
})

describe('independentPercent', () => {
  it('is independent out of every attempt except skips', () => {
    // 4 of the 10 - 2 = 8 attempts not skipped.
    expect(independentPercent(totals({ attempts: 10, independent: 4, hint: 2, revealed: 1, incorrect: 1, skipped: 2 }))).toBe(50)
  })

  it('counts hints and answers viewed first as not independent', () => {
    expect(independentPercent(totals({ attempts: 3, independent: 1, hint: 1, revealed: 1 }))).toBe(33)
  })

  it('is null before any attempt that was not skipped', () => {
    expect(independentPercent(totals())).toBeNull()
    expect(independentPercent(totals({ attempts: 2, skipped: 2 }))).toBeNull()
  })
})
