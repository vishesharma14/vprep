import { describe, expect, it } from 'vitest'
import type { EmbeddingStatus } from '../types'
import { embeddingCoverage, isPossibleDuplicate, offersSimilar, similarityPercent } from './similar'

describe('offersSimilar', () => {
  it('offers similar questions after a wrong or revealed answer only', () => {
    expect(offersSimilar('incorrect')).toBe(true)
    expect(offersSimilar('revealed')).toBe(true)
    expect(offersSimilar('independent')).toBe(false)
    expect(offersSimilar('hint')).toBe(false)
    expect(offersSimilar('skipped')).toBe(false)
  })
})

describe('similarityPercent', () => {
  it('rounds to a whole percent', () => {
    expect(similarityPercent(0.4249)).toBe(42)
    expect(similarityPercent(0.4251)).toBe(43)
    expect(similarityPercent(1)).toBe(100)
  })

  it('keeps float noise and negative similarity inside 0–100', () => {
    expect(similarityPercent(1.0000001)).toBe(100)
    expect(similarityPercent(-0.2)).toBe(0)
  })
})

describe('isPossibleDuplicate', () => {
  it('starts at 90% as shown', () => {
    expect(isPossibleDuplicate(0.9)).toBe(true)
    expect(isPossibleDuplicate(0.97)).toBe(true)
    expect(isPossibleDuplicate(0.89)).toBe(false)
  })

  it('agrees with the rounded percent at the edge', () => {
    // Shown as 90%, so marked; 89.49% shows as 89% and isn't.
    expect(isPossibleDuplicate(0.8951)).toBe(true)
    expect(isPossibleDuplicate(0.8949)).toBe(false)
  })
})

describe('embeddingCoverage', () => {
  const status = (fields: Partial<EmbeddingStatus>): EmbeddingStatus => ({
    questions: 0,
    embedded: 0,
    missing: 0,
    stale: 0,
    model: null,
    ...fields,
  })

  it('counts only embeddings made from the current text', () => {
    expect(embeddingCoverage(status({ questions: 200, embedded: 190, missing: 10, stale: 5 }))).toEqual({
      upToDate: 185,
      percent: 93,
      needsRun: true,
    })
  })

  it('needs a run when some are stale but none missing', () => {
    expect(embeddingCoverage(status({ questions: 10, embedded: 10, stale: 1 })).needsRun).toBe(true)
  })

  it("doesn't need a run when every question is up to date", () => {
    expect(embeddingCoverage(status({ questions: 216, embedded: 216 }))).toEqual({
      upToDate: 216,
      percent: 100,
      needsRun: false,
    })
  })

  it('has no percent without questions', () => {
    expect(embeddingCoverage(status({})).percent).toBeNull()
  })
})
