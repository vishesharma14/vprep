import { describe, expect, it } from 'vitest'
import {
  blankOptions,
  canPublish,
  NEW_QUESTION,
  parseTags,
  parseYear,
  questionErrors,
  questionInput,
  questionSaveError,
  type QuestionForm,
} from './questions'

/** A form that can be saved as is. */
const valid = (fields: Partial<QuestionForm> = {}): QuestionForm => ({
  ...NEW_QUESTION,
  examId: 'exam-1',
  subjectId: 'subject-1',
  topicId: 'topic-1',
  body: 'Which algorithm can starve a process?',
  options: ['FCFS', 'Round robin', 'SJF', 'None'],
  answerIndex: 2,
  ...fields,
})

describe('questionErrors', () => {
  it('finds nothing wrong with a complete draft', () => {
    expect(questionErrors(valid())).toEqual({})
  })

  it('flags everything still to fill in on a new question', () => {
    expect(questionErrors(NEW_QUESTION)).toEqual({
      topic: 'Choose an exam, then a subject and topic.',
      body: 'Write the question.',
      options: 'Fill in options A, B, C, and D, or remove them.',
      answer: 'Choose the correct option.',
    })
  })

  it('asks for the first of exam, subject and topic still to choose', () => {
    expect(questionErrors(valid({ subjectId: '', topicId: '' })).topic).toBe('Choose a subject, then a topic.')
    expect(questionErrors(valid({ topicId: '' })).topic).toBe('Choose a topic.')
  })

  it('treats a question of only spaces as empty', () => {
    expect(questionErrors(valid({ body: '  \n ' })).body).toBe('Write the question.')
  })

  it('needs 2 to 6 options', () => {
    expect(questionErrors(valid({ options: ['Only'], answerIndex: 0 })).options).toBe('Give 2 to 6 options.')
    expect(questionErrors(valid({ options: ['1', '2', '3', '4', '5', '6', '7'] })).options).toBe(
      'Give 2 to 6 options.',
    )
    expect(questionErrors(valid({ options: ['Yes', 'No'], answerIndex: 0 })).options).toBeUndefined()
  })

  it('names the blank options', () => {
    expect(questionErrors(valid({ options: ['FCFS', 'RR', ' ', 'None'] })).options).toBe(
      'Fill in option C, or remove it.',
    )
    expect(questionErrors(valid({ options: ['FCFS', '', 'SJF', ''] })).options).toBe(
      'Fill in options B and D, or remove them.',
    )
  })

  it('needs a correct option among the options', () => {
    expect(questionErrors(valid({ answerIndex: null })).answer).toBe('Choose the correct option.')
    expect(questionErrors(valid({ answerIndex: 4 })).answer).toBe('Choose the correct option.')
    expect(questionErrors(valid({ answerIndex: -1 })).answer).toBe('Choose the correct option.')
    expect(questionErrors(valid({ answerIndex: 3 })).answer).toBeUndefined()
  })

  it('needs an explanation to publish, but not for a draft or review', () => {
    expect(questionErrors(valid({ status: 'published', explanation: ' ' })).explanation).toBe(
      'Add an explanation to publish, or save it as a draft or for review.',
    )
    expect(questionErrors(valid({ status: 'in_review', explanation: '' })).explanation).toBeUndefined()
    expect(questionErrors(valid({ status: 'published', explanation: 'Because.' })).explanation).toBeUndefined()
  })

  it('needs a year in range for a PYQ only', () => {
    expect(questionErrors(valid({ type: 'pyq', year: '' })).year).toBe('A PYQ needs the year it was asked.')
    expect(questionErrors(valid({ type: 'pyq', year: '1949' })).year).toBe('Enter a year between 1950 and 2100.')
    expect(questionErrors(valid({ type: 'pyq', year: '20x4' })).year).toBe('Enter a year between 1950 and 2100.')
    expect(questionErrors(valid({ type: 'pyq', year: '2024' })).year).toBeUndefined()
    expect(questionErrors(valid({ type: 'practice', year: 'nonsense' })).year).toBeUndefined()
  })
})

describe('parseYear', () => {
  it('reads a four-digit year in range', () => {
    expect(parseYear('2024')).toBe(2024)
    expect(parseYear(' 1950 ')).toBe(1950)
    expect(parseYear('2100')).toBe(2100)
  })

  it.each(['', '1949', '2101', '99', '02024', '2024.0', '1e3', 'abcd'])('is null for %j', (text) => {
    expect(parseYear(text)).toBeNull()
  })
})

describe('parseTags', () => {
  it('splits on commas, trims, and drops blanks and repeats', () => {
    expect(parseTags('a, b , ,a')).toEqual(['a', 'b'])
  })

  it('is empty for no tags', () => {
    expect(parseTags('')).toEqual([])
    expect(parseTags(' , ')).toEqual([])
  })
})

describe('blankOptions', () => {
  it('gives the indexes of options with no text', () => {
    expect(blankOptions(['A', '', 'C', '  '])).toEqual([1, 3])
    expect(blankOptions(['A', 'B'])).toEqual([])
  })
})

describe('canPublish', () => {
  it('needs an explanation with some text', () => {
    expect(canPublish({ explanation: 'Because.' })).toBe(true)
    expect(canPublish({ explanation: '  ' })).toBe(false)
    expect(canPublish({ explanation: null })).toBe(false)
  })
})

describe('questionInput', () => {
  it('trims text and saves blank optional fields as null', () => {
    const input = questionInput(
      valid({
        subtopic: '  ',
        tags: 'os, scheduling, os',
        body: '  Which algorithm can starve a process?  ',
        options: [' FCFS ', 'Round robin', 'SJF ', 'None'],
        hint: '',
        explanation: ' Short jobs go first. ',
        source: ' ',
      }),
    )
    expect(input).toEqual({
      topic_id: 'topic-1',
      subtopic: null,
      difficulty: 'medium',
      type: 'practice',
      year: null,
      source: null,
      body: 'Which algorithm can starve a process?',
      options: ['FCFS', 'Round robin', 'SJF', 'None'],
      answer_index: 2,
      hint: null,
      explanation: 'Short jobs go first.',
      formula_id: null,
      tags: ['os', 'scheduling'],
      status: 'draft',
    })
  })

  it('saves the year for a PYQ only', () => {
    expect(questionInput(valid({ type: 'pyq', year: '2023' })).year).toBe(2023)
    expect(questionInput(valid({ type: 'practice', year: '2023' })).year).toBeNull()
  })

  it('links the chosen formula', () => {
    expect(questionInput(valid({ formulaId: 'f-1' })).formula_id).toBe('f-1')
  })
})

describe('questionSaveError', () => {
  const check = (name: string) => ({
    code: '23514',
    message: `new row for relation "questions" violates check constraint "${name}"`,
  })

  it.each([
    ['pyq_needs_year', 'A PYQ needs the year it was asked.'],
    ['published_needs_explanation', 'Add an explanation before publishing.'],
    ['options_not_blank', 'Every option needs some text.'],
    ['questions_options_check', 'Give 2 to 6 options.'],
    ['answer_in_range', 'Choose the correct option.'],
  ])('explains the %s check', (name, message) => {
    expect(questionSaveError(check(name))).toBe(message)
  })

  it('leaves an unknown check to the caller', () => {
    expect(questionSaveError(check('some_new_check'))).toBeNull()
  })

  it('explains a formula or topic that no longer exists', () => {
    const fk = (name: string) => ({
      code: '23503',
      message: `insert or update on table "questions" violates foreign key constraint "${name}"`,
    })
    expect(questionSaveError(fk('questions_formula_id_fkey'))).toBe(
      'The linked formula no longer exists. Choose another one.',
    )
    expect(questionSaveError(fk('questions_topic_id_fkey'))).toBe('That topic no longer exists. Choose another one.')
  })

  it('leaves other errors to the caller', () => {
    expect(questionSaveError({ code: '42501', message: 'permission denied for table questions' })).toBeNull()
  })
})
