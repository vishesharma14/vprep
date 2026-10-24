import { describe, expect, it } from 'vitest'
import type { TopicProgressRow } from '../types'
import type { CatalogTopic } from './useExamCatalog'
import { accuracyPercent, progressTotals } from './useTopicProgress'

describe('accuracyPercent', () => {
  it('is correct out of answered, as a whole percentage', () => {
    expect(accuracyPercent({ answered: 4, correct: 3 })).toBe(75)
    expect(accuracyPercent({ answered: 3, correct: 2 })).toBe(67)
    expect(accuracyPercent({ answered: 8, correct: 1 })).toBe(13)
  })

  it('is 0 or 100 at the ends', () => {
    expect(accuracyPercent({ answered: 5, correct: 0 })).toBe(0)
    expect(accuracyPercent({ answered: 5, correct: 5 })).toBe(100)
  })

  it('is null before any graded answer', () => {
    expect(accuracyPercent({ answered: 0, correct: 0 })).toBeNull()
  })
})

describe('progressTotals', () => {
  // Only the fields progressTotals reads.
  const catalogTopic = (id: string, question_count: number) => ({ id, question_count }) as CatalogTopic
  const row = (topic_id: string, attempted: number, answered: number, correct: number): TopicProgressRow => ({
    topic_id,
    attempted,
    answered,
    correct,
    independent: correct,
    last_attempt_at: '2026-10-01T00:00:00Z',
  })

  it('adds up the progress of the given topics', () => {
    const topics = [catalogTopic('t1', 10), catalogTopic('t2', 10)]
    const progress = new Map([
      ['t1', row('t1', 4, 6, 3)],
      ['t2', row('t2', 2, 2, 2)],
    ])
    expect(progressTotals(topics, progress)).toEqual({ attempted: 6, answered: 8, correct: 5 })
  })

  it('caps questions tried at the questions a topic still has', () => {
    // 5 tried, but 2 have since been unpublished.
    expect(progressTotals([catalogTopic('t1', 3)], new Map([['t1', row('t1', 5, 7, 4)]]))).toEqual({
      attempted: 3,
      answered: 7,
      correct: 4,
    })
  })

  it('leaves out topics with no progress and progress for other topics', () => {
    const progress = new Map([['other', row('other', 9, 9, 9)]])
    expect(progressTotals([catalogTopic('t1', 10)], progress)).toEqual({ attempted: 0, answered: 0, correct: 0 })
  })
})
