import { describe, expect, it } from 'vitest'
import { firstLine, formatClock, formatDate, formatDay, formatDuration, plural } from './format'

describe('plural', () => {
  it('uses the singular for exactly one', () => {
    expect(plural(1, 'question')).toBe('1 question')
  })

  it('adds an s for any other count, zero included', () => {
    expect(plural(0, 'question')).toBe('0 questions')
    expect(plural(12, 'point')).toBe('12 points')
  })

  it('takes an irregular plural', () => {
    expect(plural(2, 'query', 'queries')).toBe('2 queries')
  })
})

describe('firstLine', () => {
  it('stops at the first line break', () => {
    expect(firstLine('What is 2 + 2?\nA. 3\nB. 4')).toBe('What is 2 + 2?')
  })

  it('skips leading blank lines and spaces', () => {
    expect(firstLine('\n\n  Find x.\nGiven y.')).toBe('Find x.')
  })
})

describe('formatClock', () => {
  it('shows minutes and seconds', () => {
    expect(formatClock(245_000)).toBe('04:05')
  })

  it('keeps counting minutes past an hour', () => {
    expect(formatClock(75 * 60_000)).toBe('75:00')
  })

  it('rounds up, so 00:00 only shows once time is up', () => {
    expect(formatClock(1)).toBe('00:01')
    expect(formatClock(59_001)).toBe('01:00')
    expect(formatClock(0)).toBe('00:00')
  })

  it('never goes below zero', () => {
    expect(formatClock(-5_000)).toBe('00:00')
  })
})

describe('formatDuration', () => {
  it('shows seconds under a minute', () => {
    expect(formatDuration(45_000)).toBe('45s')
  })

  it('shows minutes and padded seconds under an hour', () => {
    expect(formatDuration(245_000)).toBe('4m 05s')
  })

  it('shows hours and padded minutes from an hour', () => {
    expect(formatDuration(3_720_000)).toBe('1h 02m')
  })

  it('rounds to the nearest second', () => {
    expect(formatDuration(59_500)).toBe('1m 00s')
    expect(formatDuration(1_400)).toBe('1s')
  })

  it('never goes below zero', () => {
    expect(formatDuration(-1)).toBe('0s')
  })
})

describe('formatDate', () => {
  it('shows day, short month and year', () => {
    // Midday UTC is the same date in every time zone the tests might run in.
    expect(formatDate('2026-10-22T12:00:00Z')).toBe('22 Oct 2026')
  })
})

describe('formatDay', () => {
  it('shows the day as given, whatever the time zone', () => {
    expect(formatDay('2026-10-23')).toBe('23 Oct')
    expect(formatDay('2026-01-01')).toBe('1 Jan')
  })
})
