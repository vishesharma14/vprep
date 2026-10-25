import { describe, expect, it } from 'vitest'
import type { StudyPlanRow } from '../types'
import { masteryPercent, planHref, planReason } from './studyPlan'

/** A recommend_topics() row; pass `kind` and the numbers the test cares about. */
const row = (fields: Partial<StudyPlanRow>) =>
  ({
    topic_id: 'topic-1',
    topic_name: 'Scheduling',
    subject_name: 'Operating Systems',
    exam_slug: 'gate-cse',
    exam_name: 'GATE CSE',
    kind: 'review',
    mastery: 0.8,
    answered: 5,
    open_mistakes: 0,
    days_since: 2,
    review_interval: 14,
    new_questions: 3,
    score: 0.12,
    ...fields,
  }) as StudyPlanRow

const NEW = { kind: 'new', mastery: null, answered: 0, days_since: null, review_interval: null } as const

describe('masteryPercent', () => {
  it('rounds to a whole percent', () => {
    expect(masteryPercent(0.45)).toBe(45)
    expect(masteryPercent(0.4333333)).toBe(43)
    expect(masteryPercent(0.875)).toBe(88)
  })

  it('rounds the real values Postgres returns', () => {
    // (1 + 1) / (1 + 2) as a real: one answer solved on your own.
    expect(masteryPercent(0.6666667)).toBe(67)
    expect(masteryPercent(0.33333334)).toBe(33)
  })

  it('keeps float noise inside 0–100', () => {
    expect(masteryPercent(1.0000001)).toBe(100)
    expect(masteryPercent(-0.0000001)).toBe(0)
  })
})

describe('planReason', () => {
  it('counts open mistakes, with the mastery', () => {
    expect(planReason(row({ kind: 'mistakes', open_mistakes: 2, mastery: 0.45 }))).toBe(
      '2 mistakes to fix · mastery 45%',
    )
    expect(planReason(row({ kind: 'mistakes', open_mistakes: 1, mastery: 0.33333334 }))).toBe(
      '1 mistake to fix · mastery 33%',
    )
  })

  it('gives the estimated mastery and how many answers it rests on for a weak topic', () => {
    expect(planReason(row({ kind: 'weak', mastery: 0.45, answered: 4 }))).toBe(
      'Estimated mastery 45% over 4 answers',
    )
    expect(planReason(row({ kind: 'weak', mastery: 0.33333334, answered: 1 }))).toBe(
      'Estimated mastery 33% over 1 answer',
    )
  })

  it('says how long ago a due topic was practised', () => {
    expect(planReason(row({ kind: 'due', days_since: 9, review_interval: 7 }))).toBe(
      'Last practised 9 days ago, time to review',
    )
    expect(planReason(row({ kind: 'due', days_since: 1, review_interval: 1 }))).toBe(
      'Last practised 1 day ago, time to review',
    )
  })

  it('keeps a topic that needs nothing else fresh', () => {
    expect(planReason(row({ kind: 'review' }))).toBe('Keep it fresh')
  })

  it('counts the questions not tried yet in a new topic', () => {
    expect(planReason(row({ ...NEW, new_questions: 12 }))).toBe('New topic · 12 questions')
    expect(planReason(row({ ...NEW, new_questions: 1 }))).toBe('New topic · 1 question')
  })
})

describe('planHref', () => {
  it('practises the topic', () => {
    expect(planHref(row({ kind: 'weak', topic_id: 'abc' }))).toBe('/practice?topic=abc')
    expect(planHref(row({ ...NEW, topic_id: 'abc' }))).toBe('/practice?topic=abc')
  })

  it('practises the whole topic for mistakes too, as Revision has no per-topic list', () => {
    expect(planHref(row({ kind: 'mistakes', open_mistakes: 2, topic_id: 'abc' }))).toBe('/practice?topic=abc')
  })
})
