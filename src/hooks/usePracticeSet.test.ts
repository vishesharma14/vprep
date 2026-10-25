import { describe, expect, it } from 'vitest'
import { parseScope } from './usePracticeSet'

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
