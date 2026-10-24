import { describe, expect, it } from 'vitest'
import { STATUS_FILL, STATUS_LABEL, STATUS_ORDER, STATUS_TONE, statusCounts } from './status'

describe('statusCounts', () => {
  it('counts results by status, with 0 for statuses not seen', () => {
    const results = (['hint', 'incorrect', 'hint', 'skipped'] as const).map((status) => ({ status }))
    expect(statusCounts(results)).toEqual({ independent: 0, hint: 2, revealed: 0, incorrect: 1, skipped: 1 })
  })

  it('is all zeros for no results', () => {
    expect(Object.values(statusCounts([]))).toEqual([0, 0, 0, 0, 0])
  })
})

describe('STATUS_ORDER', () => {
  it('lists every status once, best outcome first', () => {
    expect(STATUS_ORDER).toEqual(['independent', 'hint', 'revealed', 'incorrect', 'skipped'])
  })

  it('has a label, tone and fill for each status', () => {
    for (const map of [STATUS_LABEL, STATUS_TONE, STATUS_FILL]) {
      expect(Object.keys(map).sort()).toEqual([...STATUS_ORDER].sort())
    }
  })
})
