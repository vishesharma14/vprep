import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { practiceQuestion, topic } from '../test/fixtures'
import {
  clearRunningTest,
  grade,
  loadRunningTest,
  newTest,
  resumable,
  saveRunningTest,
  shuffle,
  topicScores,
  type RunningTest,
} from './timedTest'

const scheduling = topic({ id: 'topic-s', name: 'Scheduling' })
const paging = topic({ id: 'topic-p', name: 'Paging' })

// Correct answers: q1 → 0, q2 → 1, q3 → 2, q4 → 3.
const questions = [
  practiceQuestion({ id: 'q1', answer_index: 0 }, scheduling),
  practiceQuestion({ id: 'q2', answer_index: 1 }, scheduling),
  practiceQuestion({ id: 'q3', answer_index: 2 }, paging),
  practiceQuestion({ id: 'q4', answer_index: 3, options: ['A', 'B', 'C', 'D'] }, paging),
]
const byId = new Map(questions.map((q) => [q.id, q]))

const running = (fields: Partial<RunningTest> = {}): RunningTest => ({
  ...newTest('exam:gate-cse', ['q1', 'q2', 'q3', 'q4'], 60),
  ...fields,
})

describe('newTest', () => {
  it('starts with no answers, nothing marked, on the first question', () => {
    vi.useFakeTimers({ now: 1_000_000 })
    const test = newTest('topic:t1', ['a', 'b', 'c'], 45)
    vi.useRealTimers()

    expect(test).toEqual({
      version: 1,
      scope: 'topic:t1',
      questionIds: ['a', 'b', 'c'],
      answers: [null, null, null],
      marked: [false, false, false],
      current: 0,
      spent: [0, 0, 0],
      startedAt: 1_000_000,
      deadline: 1_000_000 + 3 * 45 * 1000,
    })
  })
})

describe('grade', () => {
  it('marks right answers independent, wrong ones incorrect and blanks skipped', () => {
    const test = running({ answers: [0, 0, null, 3], spent: [1000, 2000, 3000, 4000] })
    expect(grade(test, byId).map((r) => [r.question.id, r.status, r.selectedIndex, r.timeSpentMs])).toEqual([
      ['q1', 'independent', 0, 1000],
      ['q2', 'incorrect', 0, 2000],
      ['q3', 'skipped', null, 3000],
      ['q4', 'independent', 3, 4000],
    ])
  })

  it('never gives a hint status: tests have no hints', () => {
    const results = grade(running({ answers: [0, 1, 2, 3] }), byId)
    expect(results.every((r) => r.status === 'independent')).toBe(true)
  })

  it('keeps the test order', () => {
    const test = running({ questionIds: ['q4', 'q1'], answers: [null, null], marked: [false, false], spent: [0, 0] })
    expect(grade(test, byId).map((r) => r.question.id)).toEqual(['q4', 'q1'])
  })
})

describe('topicScores', () => {
  it('counts correct answers per topic, weakest first', () => {
    // Scheduling: 1 of 2. Paging: 2 of 2.
    const results = grade(running({ answers: [0, 3, 2, 3] }), byId)
    expect(topicScores(results).map((s) => [s.topic.name, s.correct, s.total])).toEqual([
      ['Scheduling', 1, 2],
      ['Paging', 2, 2],
    ])
  })

  it('counts skips as not correct', () => {
    const results = grade(running({ answers: [null, null, 2, null] }), byId)
    expect(topicScores(results).map((s) => [s.topic.name, s.correct, s.total])).toEqual([
      ['Scheduling', 0, 2],
      ['Paging', 1, 2],
    ])
  })

  it('breaks ties by more questions, then by name', () => {
    const results = grade(
      running({
        questionIds: ['q1', 'q3', 'q4'],
        answers: [0, 2, 3],
        marked: [false, false, false],
        spent: [0, 0, 0],
      }),
      byId,
    )
    // Both 100%: Paging has 2 questions, Scheduling 1.
    expect(topicScores(results).map((s) => s.topic.name)).toEqual(['Paging', 'Scheduling'])

    const sameSize = grade(
      running({ questionIds: ['q3', 'q1'], answers: [2, 0], marked: [false, false], spent: [0, 0] }),
      byId,
    )
    expect(topicScores(sameSize).map((s) => s.topic.name)).toEqual(['Paging', 'Scheduling'])
  })
})

describe('resumable', () => {
  it('keeps a test whose questions are all still there', () => {
    const test = running({ answers: [0, 1, null, 3], current: 2 })
    expect(resumable(test, byId)).toEqual(test)
  })

  it('drops questions no longer published, with their answers, marks and time', () => {
    const test = running({
      questionIds: ['q1', 'gone', 'q3'],
      answers: [0, 1, 2],
      marked: [false, true, false],
      spent: [10, 20, 30],
      current: 2,
    })
    expect(resumable(test, byId)).toMatchObject({
      questionIds: ['q1', 'q3'],
      answers: [0, 2],
      marked: [false, false],
      spent: [10, 30],
      current: 1,
    })
  })

  it('goes back to the first question when the current one is gone', () => {
    const test = running({ questionIds: ['q1', 'gone'], answers: [null, null], marked: [false, false], spent: [0, 0], current: 1 })
    expect(resumable(test, byId)?.current).toBe(0)
  })

  it('clears an answer whose option no longer exists', () => {
    const shorter = new Map(byId).set('q4', { ...byId.get('q4')!, options: ['A', 'B'] })
    const test = running({ answers: [0, 1, 2, 3] })
    expect(resumable(test, shorter)?.answers).toEqual([0, 1, 2, null])
  })

  it('is null when none of the questions are left', () => {
    const test = running({ questionIds: ['gone'], answers: [null], marked: [false], spent: [0] })
    expect(resumable(test, byId)).toBeNull()
  })
})

describe('saved tests', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const saveRaw = (value: unknown) => sessionStorage.setItem('vprep:timed-test', JSON.stringify(value))

  it('loads a saved test for the same scope', () => {
    const test = running({ answers: [0, null, null, 1], marked: [true, false, false, false], current: 3 })
    saveRunningTest(test)
    expect(loadRunningTest('exam:gate-cse')).toEqual(test)
  })

  it('ignores a test from another scope', () => {
    saveRunningTest(running())
    expect(loadRunningTest('exam:ssc-cgl')).toBeNull()
  })

  it('is gone once cleared', () => {
    saveRunningTest(running())
    clearRunningTest()
    expect(loadRunningTest('exam:gate-cse')).toBeNull()
  })

  it('ignores storage that is not JSON', () => {
    sessionStorage.setItem('vprep:timed-test', '{not json')
    expect(loadRunningTest('exam:gate-cse')).toBeNull()
  })

  it.each<[string, Partial<RunningTest> | Record<string, unknown>]>([
    ['another version', { version: 2 }],
    ['no questions', { questionIds: [], answers: [], marked: [], spent: [] }],
    ['lists of different lengths', { answers: [null, null] }],
    ['a negative answer', { answers: [-1, null, null, null] }],
    ['a fractional answer', { answers: [0.5, null, null, null] }],
    ['a mark that is not true or false', { marked: [1, 0, 0, 0] }],
    ['negative time', { spent: [-1, 0, 0, 0] }],
    ['a current question past the end', { current: 4 }],
    ['no deadline', { deadline: null }],
  ])('ignores a saved test with %s', (_, fields) => {
    saveRaw({ ...running(), ...fields })
    expect(loadRunningTest('exam:gate-cse')).toBeNull()
  })

  it('works without storage: nothing loads, and saving does not throw', () => {
    vi.stubGlobal('sessionStorage', undefined)
    expect(() => saveRunningTest(running())).not.toThrow()
    expect(loadRunningTest('exam:gate-cse')).toBeNull()
    expect(() => clearRunningTest()).not.toThrow()
  })
})

describe('shuffle', () => {
  it('returns the same items in some order, leaving the original alone', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    const shuffled = shuffle(items)
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items)
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(shuffled).not.toBe(items)
  })

  it('swaps with the random index it picks', () => {
    // Math.random() of 0 always picks index 0: each item in turn swaps with the first.
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(shuffle(['a', 'b', 'c'])).toEqual(['b', 'c', 'a'])
    random.mockRestore()
  })
})
