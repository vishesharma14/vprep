import { describe, expect, it } from 'vitest'
import { question } from '../test/fixtures'
import { parseScope, similarQuestions, type SimilarQuestion } from './usePracticeSet'

describe('parseScope', () => {
  const scope = (query: string) => parseScope(new URLSearchParams(query))

  it('reads each kind of scope', () => {
    expect(scope('topic=t1')).toEqual({ kind: 'topic', id: 't1' })
    expect(scope('subject=s1')).toEqual({ kind: 'subject', id: 's1' })
    expect(scope('exam=gate-cse')).toEqual({ kind: 'exam', slug: 'gate-cse' })
    expect(scope('q=q1')).toEqual({ kind: 'ids', ids: ['q1'] })
  })

  it('reads a list of ids, trimmed, without blanks or repeats', () => {
    expect(scope('ids=q1, q2,,q1, ')).toEqual({ kind: 'ids', ids: ['q1', 'q2'] })
  })

  it('takes the first present of topic, subject, exam, ids, then q', () => {
    expect(scope('q=q1&exam=gate-cse&subject=s1&topic=t1')).toEqual({ kind: 'topic', id: 't1' })
    expect(scope('q=q1&ids=q2&exam=gate-cse')).toEqual({ kind: 'exam', slug: 'gate-cse' })
    expect(scope('q=q1&ids=q2')).toEqual({ kind: 'ids', ids: ['q2'] })
  })

  it('skips empty values', () => {
    expect(scope('topic=&exam=gate-cse')).toEqual({ kind: 'exam', slug: 'gate-cse' })
  })

  it('is null with none of them', () => {
    expect(scope('')).toBeNull()
    expect(scope('category=engineering')).toBeNull()
  })
})

describe('similarQuestions', () => {
  const current = question({ id: 'q0', code: 'Q1000', topic_id: 't1', subtopic: 'SJF', tags: ['starvation'] })
  const other = (id: string, code: string, fields: Partial<SimilarQuestion> = {}): SimilarQuestion => ({
    id,
    code,
    topic_id: 't1',
    subtopic: null,
    tags: [],
    body: 'Another question',
    difficulty: 'medium',
    ...fields,
  })

  it('puts same subtopic first, then a shared tag, then by code', () => {
    const pool = [
      other('plain', 'Q1002'),
      other('tag', 'Q1009', { tags: ['starvation'] }),
      other('subtopic', 'Q1010', { subtopic: 'SJF' }),
      other('both', 'Q1011', { subtopic: 'SJF', tags: ['starvation'] }),
      other('plain-early', 'Q999'),
    ]
    expect(similarQuestions(current, pool, 10).map((q) => q.id)).toEqual([
      'both',
      'subtopic',
      'tag',
      'plain-early',
      'plain',
    ])
  })

  it('leaves out the question itself and other topics', () => {
    const pool = [other('q0', 'Q1000'), other('elsewhere', 'Q1001', { topic_id: 't2', subtopic: 'SJF' }), other('ok', 'Q1003')]
    expect(similarQuestions(current, pool).map((q) => q.id)).toEqual(['ok'])
  })

  it('gives at most 3 by default', () => {
    const pool = ['Q1001', 'Q1002', 'Q1003', 'Q1004'].map((code) => other(code, code))
    expect(similarQuestions(current, pool)).toHaveLength(3)
  })

  it("doesn't match on a missing subtopic", () => {
    const noSubtopic = question({ id: 'q0', topic_id: 't1', subtopic: null, tags: [] })
    const pool = [other('a', 'Q1002'), other('b', 'Q1001')]
    expect(similarQuestions(noSubtopic, pool).map((q) => q.id)).toEqual(['b', 'a'])
  })
})
