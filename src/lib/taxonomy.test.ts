import { describe, expect, it } from 'vitest'
import {
  examErrors,
  examInput,
  nameError,
  NEW_EXAM,
  nextPosition,
  renameExam,
  reorder,
  taxonomyError,
} from './taxonomy'

describe('nameError', () => {
  it('asks for a name when empty', () => {
    expect(nameError('topic', '   ')).toBe('Give the topic a name.')
  })

  it('caps the length at what the database accepts', () => {
    expect(nameError('exam', 'x'.repeat(60))).toBeUndefined()
    expect(nameError('exam', 'x'.repeat(61))).toBe('Keep the name to 60 characters.')
    expect(nameError('subject', 'x'.repeat(80))).toBeUndefined()
    expect(nameError('subject', 'x'.repeat(81))).toBe('Keep the name to 80 characters.')
  })

  it('counts characters, not UTF-16 units', () => {
    // 60 emoji are 120 UTF-16 units, but 60 characters to the database.
    expect(nameError('exam', '📘'.repeat(60))).toBeUndefined()
    expect(nameError('exam', '📘'.repeat(61))).toBe('Keep the name to 60 characters.')
  })

  it('does not count spaces around the name', () => {
    expect(nameError('exam', ` ${'x'.repeat(60)} `)).toBeUndefined()
  })
})

describe('examErrors', () => {
  const filled = { name: 'JEE Main', fullName: '', category: 'engineering' as const, slug: 'jee-main' }

  it('finds nothing wrong with a filled-in form', () => {
    expect(examErrors(filled, ['gate-cse'])).toEqual({})
  })

  it('flags name, category and slug on a new form', () => {
    expect(examErrors(NEW_EXAM, [])).toEqual({
      name: 'Give the exam a name.',
      category: 'Choose a category.',
      slug: 'Add a slug, made of lowercase letters and digits.',
    })
  })

  it("rejects another exam's slug", () => {
    expect(examErrors(filled, ['jee-main']).slug).toBe('Another exam already uses this slug. Change it, or the name.')
  })

  it("doesn't check the slug when editing, as it stays", () => {
    expect(examErrors({ ...filled, slug: 'Not A Slug' }, null).slug).toBeUndefined()
  })
})

describe('renameExam', () => {
  it('moves the slug with the name while it matches', () => {
    expect(renameExam({ ...NEW_EXAM, name: 'JEE', slug: 'jee' }, 'JEE Main').slug).toBe('jee-main')
  })

  it('leaves a hand-edited slug alone', () => {
    expect(renameExam({ ...NEW_EXAM, name: 'JEE', slug: 'iit-jee' }, 'JEE Main').slug).toBe('iit-jee')
  })
})

describe('examInput', () => {
  it('trims the names and saves a blank full name as null', () => {
    expect(examInput({ name: ' JEE Main ', fullName: '  ', category: 'engineering', slug: 'jee-main' })).toEqual({
      slug: 'jee-main',
      name: 'JEE Main',
      full_name: null,
      category: 'engineering',
    })
  })
})

describe('reorder', () => {
  const items = [
    { id: 'a', position: 1 },
    { id: 'b', position: 2 },
    { id: 'c', position: 3 },
  ]

  it('swaps the positions of an item and the one below it', () => {
    expect(reorder(items, 0, 1)).toEqual([
      { id: 'b', position: 1 },
      { id: 'a', position: 2 },
    ])
  })

  it('swaps the positions of an item and the one above it', () => {
    expect(reorder(items, 2, -1)).toEqual([
      { id: 'c', position: 2 },
      { id: 'b', position: 3 },
    ])
  })

  it('keeps positions that have gaps', () => {
    const spaced = [
      { id: 'a', position: 10 },
      { id: 'b', position: 20 },
      { id: 'c', position: 30 },
    ]
    expect(reorder(spaced, 1, 1)).toEqual([
      { id: 'c', position: 20 },
      { id: 'b', position: 30 },
    ])
  })

  it('numbers the whole list 1, 2, 3… when positions tie', () => {
    const tied = [
      { id: 'a', position: 1 },
      { id: 'b', position: 1 },
      { id: 'c', position: 1 },
    ]
    // Order becomes a, c, b; a already has position 1.
    expect(reorder(tied, 2, -1)).toEqual([
      { id: 'c', position: 2 },
      { id: 'b', position: 3 },
    ])
  })

  it('changes nothing past either end', () => {
    expect(reorder(items, 0, -1)).toEqual([])
    expect(reorder(items, 2, 1)).toEqual([])
  })
})

describe('nextPosition', () => {
  it('puts a new item after the last', () => {
    expect(
      nextPosition([
        { id: 'a', position: 1 },
        { id: 'b', position: 5 },
        { id: 'c', position: 3 },
      ]),
    ).toBe(6)
  })

  it('starts at 1', () => {
    expect(nextPosition([])).toBe(1)
  })
})

describe('taxonomyError', () => {
  it('explains a constraint it knows', () => {
    expect(taxonomyError({ message: 'duplicate key value violates unique constraint "exams_slug_key"' })).toBe(
      'Another exam already uses this slug. Change it, or the name.',
    )
    expect(
      taxonomyError({
        message: 'update or delete on table "topics" violates foreign key constraint "questions_topic_id_fkey" on table "questions"',
      }),
    ).toBe("It still has questions, so it can't be deleted. Move or delete them first.")
  })

  it('leaves other errors to the caller', () => {
    expect(taxonomyError({ message: 'violates check constraint "something_else"' })).toBeNull()
    expect(taxonomyError({ message: 'permission denied for table exams' })).toBeNull()
  })
})
