import { describe, expect, it } from 'vitest'
import { exam, question, subject, topic } from '../test/fixtures'
import type { Question } from '../types'
import {
  checkImport,
  checkRow,
  CSV_COLUMNS,
  exportFileName,
  findDuplicates,
  MAX_IMPORT_ROWS,
  parseQuestionCsv,
  questionsCsv,
  readQuestionCsv,
  templateCsv,
  type CsvCells,
  type CsvExam,
  type ImportContext,
} from './questionCsv'

/** GATE CSE › Operating Systems › Scheduling and Deadlocks; SSC CGL › Quantitative Aptitude › Profit & Loss. */
const exams: CsvExam[] = [
  {
    ...exam(),
    subjects: [
      { ...subject(), topics: [topic(), topic({ id: 'topic-2', slug: 'deadlocks', name: 'Deadlocks', position: 2 })] },
    ],
  },
  {
    ...exam({ id: 'exam-2', slug: 'ssc-cgl', name: 'SSC CGL', category: 'government' }),
    subjects: [
      {
        ...subject({ id: 'subject-2', exam_id: 'exam-2', slug: 'quantitative-aptitude', name: 'Quantitative Aptitude' }),
        topics: [topic({ id: 'topic-3', subject_id: 'subject-2', slug: 'profit-loss', name: 'Profit & Loss' })],
      },
    ],
  },
]

const formulas = [{ id: 'formula-1', slug: 'profit-and-loss' }]

const context: ImportContext = { exams, formulas, questions: [] }

const HEADER = CSV_COLUMNS.join(',')

/** Only the columns a file must have. */
const REQUIRED = 'exam,subject,topic,question,option_a,option_b,answer'

/** A row that can be imported as is, with the cells a test cares about passed in. */
const cells = (fields: Partial<CsvCells> = {}): CsvCells => ({
  ...(Object.fromEntries(CSV_COLUMNS.map((column) => [column, ''])) as CsvCells),
  exam: 'gate-cse',
  subject: 'operating-systems',
  topic: 'scheduling',
  question: 'Which algorithm can starve a process?',
  option_a: 'FCFS',
  option_b: 'Round robin',
  option_c: 'SJF',
  option_d: 'None',
  answer: 'C',
  ...fields,
})

const errorsOf = (fields: Partial<CsvCells>) => checkRow(cells(fields), context).errors

/** The rows of a parse that is expected to succeed. */
function rowsOf(text: string) {
  const parsed = parseQuestionCsv(text)
  if (parsed.error !== undefined) throw new Error(parsed.error)
  return parsed.rows
}

describe('parseQuestionCsv', () => {
  it('reads quoted commas, quotes and line breaks, and skips a BOM', () => {
    const text =
      `\ufeff${REQUIRED}\r\n` +
      'gate-cse,operating-systems,scheduling,"Pick one, or none.","He said ""yes""","Line 1\r\nLine 2",A\r\n'
    const [row] = rowsOf(text)
    expect(row.cells.exam).toBe('gate-cse')
    expect(row.cells.question).toBe('Pick one, or none.')
    expect(row.cells.option_a).toBe('He said "yes"')
    expect(row.cells.option_b).toBe('Line 1\nLine 2')
    expect(row.overflow).toBe(false)
  })

  it('gives each question its row in the spreadsheet, skipping blank rows', () => {
    const text = `${HEADER}\n\n${CSV_COLUMNS.map(() => 'x').join(',')}\n,,,\n"a\nb",${'y,'.repeat(20)}\n`
    expect(rowsOf(text).map((row) => row.row)).toEqual([3, 5])
  })

  it('matches column names ignoring case and spaces, and leaves out optional columns', () => {
    const [row] = rowsOf('Exam,Subject,Topic,Question,Option A,option-b,ANSWER\ngate-cse,os,sched,Q?,1,2,A')
    expect(row.cells).toMatchObject({ exam: 'gate-cse', option_a: '1', option_b: '2', answer: 'A' })
    expect(row.cells.hint).toBe('')
    expect(row.cells.status).toBe('')
  })

  it('ignores the code column of an exported file', () => {
    const [row] = rowsOf(`code,${HEADER}\nQ1001,gate-cse`)
    expect(row.cells.exam).toBe('gate-cse')
    expect(Object.values(row.cells)).not.toContain('Q1001')
  })

  it('takes off the quote mark export puts before = + - and @', () => {
    const [row] = rowsOf(`${REQUIRED}\nx,y,z,'=1+1,'-1,'it''s,A`)
    expect(row.cells.question).toBe('=1+1')
    expect(row.cells.option_a).toBe('-1')
    expect(row.cells.option_b).toBe("'it''s")
  })

  it('flags text past the last column, but not blank cells', () => {
    const [blank, extra] = rowsOf(`${HEADER}\n${'x,'.repeat(21)},,\n${'x,'.repeat(21)}oops`)
    expect(blank.overflow).toBe(false)
    expect(extra.overflow).toBe(true)
  })

  it('names unknown, repeated and missing columns', () => {
    expect(parseQuestionCsv(`${HEADER},explaination`).error).toBe(
      'The header row has a column not in the template: "explaination". ' +
        'The first row must be the header, with the names as in the template.',
    )
    expect(parseQuestionCsv(`${HEADER},Hint`).error).toBe('The header row has "hint" more than once.')
    expect(parseQuestionCsv('exam,subject,topic,question,option_a').error).toBe(
      'The header row is missing "option_b" and "answer".',
    )
  })

  it('turns down an empty file, or one with no questions', () => {
    expect(parseQuestionCsv('').error).toBe('The file is empty.')
    expect(parseQuestionCsv('\ufeff\r\n , \r\n').error).toBe('The file is empty.')
    expect(parseQuestionCsv(`${HEADER}\r\n,,,\r\n`).error).toBe('The file has a header row but no questions under it.')
  })

  it(`takes at most ${MAX_IMPORT_ROWS} questions`, () => {
    const file = (count: number) => [HEADER, ...Array.from({ length: count }, (_, i) => `x,y,z,Q${i}`)].join('\n')
    expect(rowsOf(file(MAX_IMPORT_ROWS))).toHaveLength(MAX_IMPORT_ROWS)
    expect(parseQuestionCsv(file(MAX_IMPORT_ROWS + 1)).error).toBe(
      'The file has 501 questions. Import at most 500 at a time: split it into smaller files.',
    )
  })

  it('names the row with a quote that is never closed', () => {
    expect(parseQuestionCsv(`${HEADER}\nx,y,z,Q1\nx,y,z,"Q2\nx,y,z,Q3`).error).toMatch(/^Row 3 has a quote/)
  })
})

describe('readQuestionCsv', () => {
  it('reads a UTF-8 file with a BOM, keeping Hindi and ₹', async () => {
    const bytes = new TextEncoder().encode(`\ufeff${REQUIRED}\nx,y,z,भारत में ₹1 कितने पैसे?`)
    const parsed = await readQuestionCsv(new File([bytes], 'questions.CSV'))
    expect(parsed.rows?.[0].cells.question).toBe('भारत में ₹1 कितने पैसे?')
  })

  it("turns down a file that isn't CSV, or isn't UTF-8", async () => {
    expect((await readQuestionCsv(new File(['x'], 'questions.xlsx'))).error).toBe(
      "questions.xlsx isn't a CSV file. In Excel use Save As → CSV UTF-8.",
    )
    // "Café" as Windows-1252, which Excel's plain "CSV" saves.
    const latin1 = new Uint8Array([...new TextEncoder().encode(`${HEADER}\nx,y,z,Caf`), 0xe9])
    expect((await readQuestionCsv(new File([latin1], 'q.csv'))).error).toBe(
      "The file isn't saved as UTF-8, so some of its letters can't be read. In Excel use Save As → CSV UTF-8.",
    )
  })
})

describe('checkRow', () => {
  it('turns a complete row into the question to insert', () => {
    const row = checkRow(
      cells({
        subtopic: ' Starvation ',
        difficulty: 'Hard',
        type: 'PYQ',
        year: '2021',
        source: 'GATE 2021',
        option_e: 'All of them',
        answer: 'e',
        hint: 'Think of short jobs.',
        explanation: 'Long jobs can wait for ever.',
        formula: 'Profit-and-Loss',
        tags: 'cpu; starvation,  sjf ;cpu',
        status: 'In review',
      }),
      context,
    )
    expect(row.errors).toEqual([])
    expect(row.input).toEqual({
      topic_id: 'topic-1',
      subtopic: 'Starvation',
      difficulty: 'hard',
      type: 'pyq',
      year: 2021,
      source: 'GATE 2021',
      body: 'Which algorithm can starve a process?',
      options: ['FCFS', 'Round robin', 'SJF', 'None', 'All of them'],
      answer_index: 4,
      hint: 'Think of short jobs.',
      explanation: 'Long jobs can wait for ever.',
      formula_id: 'formula-1',
      tags: ['cpu', 'starvation', 'sjf'],
      status: 'in_review',
    })
  })

  it('fills in medium, practice and draft when those cells are blank', () => {
    expect(checkRow(cells(), context).input).toMatchObject({
      difficulty: 'medium',
      type: 'practice',
      year: null,
      status: 'draft',
      subtopic: null,
      formula_id: null,
      tags: [],
    })
  })

  it('finds the exam, subject and topic by slug or by name, ignoring case', () => {
    const row = checkRow(cells({ exam: 'SSC CGL', subject: 'quantitative-aptitude', topic: ' profit & loss ' }), context)
    expect(row.errors).toEqual([])
    expect(row.input?.topic_id).toBe('topic-3')
    expect(row.topic?.name).toBe('Profit & Loss')
  })

  it('says which of exam, subject and topic is missing or unknown', () => {
    expect(errorsOf({ exam: '' })).toEqual(["The exam is empty. Give the exam's slug or name."])
    expect(errorsOf({ exam: 'jee' })).toEqual(['There\'s no exam "jee". Give an exam\'s slug or name.'])
    expect(errorsOf({ subject: 'Quantitative Aptitude' })).toEqual([
      'GATE CSE has no subject "Quantitative Aptitude".',
    ])
    expect(errorsOf({ topic: 'profit-loss' })).toEqual(['Operating Systems has no topic "profit-loss".'])
    expect(errorsOf({ topic: '' })).toEqual(['The topic is empty. Give a topic of Operating Systems.'])
  })

  it('keeps what was found of the place for the preview', () => {
    const row = checkRow(cells({ topic: 'paging' }), context)
    expect(row.exam?.name).toBe('GATE CSE')
    expect(row.subject?.name).toBe('Operating Systems')
    expect(row.topic).toBeUndefined()
  })

  it('names the allowed values for difficulty, type and status', () => {
    expect(errorsOf({ difficulty: 'tough' })).toEqual(['The difficulty must be easy, medium, or hard, not "tough".'])
    expect(errorsOf({ type: 'mock' })).toEqual(['The type must be practice or pyq, not "mock".'])
    expect(errorsOf({ status: 'live' })).toEqual([
      'The status must be draft, in_review, or published, not "live".',
    ])
    expect(checkRow(cells({ status: 'live' }), context).status).toBeNull()
  })

  it('needs a year in range for a PYQ, and none for practice', () => {
    expect(errorsOf({ type: 'pyq' })).toEqual(['A PYQ needs the year it was asked.'])
    expect(errorsOf({ type: 'pyq', year: '20234' })).toEqual(['The year must be between 1950 and 2100, not "20234".'])
    expect(errorsOf({ year: '1949' })).toEqual(['The year must be between 1950 and 2100, not "1949".'])
    expect(errorsOf({ year: '2020' })).toEqual(['Only a PYQ has a year. Set the type to pyq, or clear the year.'])
  })

  it('needs the question', () => {
    expect(errorsOf({ question: ' \n ' })).toEqual(['The question is empty.'])
  })

  it('needs 2 or more options, from option_a with no gaps', () => {
    expect(errorsOf({ option_b: ' ' })).toEqual([
      'Option B is empty, but a later option is filled in. Fill in the options from option_a, with no gaps.',
    ])
    expect(errorsOf({ option_a: '', option_c: '', option_f: 'Last' })).toEqual([
      'Options A, C, and E are empty, but a later option is filled in. Fill in the options from option_a, with no gaps.',
    ])
    expect(errorsOf({ option_b: '', option_c: '', option_d: '', answer: 'A' })).toEqual([
      'Give at least 2 options, starting from option_a.',
    ])
    expect(checkRow(cells({ option_c: '', option_d: '', answer: 'B' }), context).input?.options).toEqual([
      'FCFS',
      'Round robin',
    ])
  })

  it('needs the letter of one of the options as the answer', () => {
    expect(errorsOf({ answer: '' })).toEqual(['The answer is empty. Give the letter of the correct option, A to D.'])
    expect(errorsOf({ answer: '3' })).toEqual(['The answer must be a letter, A to D, not "3".'])
    expect(errorsOf({ answer: 'Option C' })).toEqual(['The answer must be a letter, A to D, not "Option C".'])
    expect(errorsOf({ answer: 'E' })).toEqual(["The answer is E, but there's no option E."])
  })

  it('needs an explanation to publish', () => {
    expect(errorsOf({ status: 'published' })).toEqual([
      'A published question needs an explanation. Add one, or set the status to draft or in_review.',
    ])
    expect(errorsOf({ status: 'published', explanation: 'Short jobs go first.' })).toEqual([])
  })

  it('needs the slug of an existing formula, if any', () => {
    expect(errorsOf({ formula: 'Profit and Loss' })).toEqual([
      'There\'s no formula with the slug "Profit and Loss".',
    ])
  })

  it('lists every error, in column order, and inserts nothing', () => {
    const row = checkRow(
      cells({ exam: 'jee', difficulty: 'x', question: '', option_b: '', answer: 'Z', status: 'published' }),
      context,
    )
    expect(row.errors).toEqual([
      'There\'s no exam "jee". Give an exam\'s slug or name.',
      'The difficulty must be easy, medium, or hard, not "x".',
      'The question is empty.',
      'Option B is empty, but a later option is filled in. Fill in the options from option_a, with no gaps.',
      "The answer is Z, but there's no option Z.",
      'A published question needs an explanation. Add one, or set the status to draft or in_review.',
    ])
    expect(row.input).toBeNull()
  })
})

describe('findDuplicates', () => {
  const saved = [
    { code: 'Q1023', body: 'What is 2 + 2?' },
    { code: 'Q1002', body: 'Name  the CAPITAL\nof India.' },
    { code: 'Q1100', body: 'name the capital of india.' },
  ]

  it('finds a saved question with the same text, ignoring case and extra spaces', () => {
    const rows = [
      { row: 2, body: '  what is 2 +   2? ' },
      { row: 3, body: 'What is 2 + 3?' },
      { row: 4, body: 'Name the capital of India.' },
    ]
    // The earliest code, when several saved questions match.
    expect(findDuplicates(rows, saved)).toEqual(
      new Map([
        [2, 'Same as Q1023'],
        [4, 'Same as Q1002'],
      ]),
    )
  })

  it('points a repeat in the file at the first row with that text', () => {
    const rows = [
      { row: 2, body: 'Odd one out?' },
      { row: 5, body: 'Find x.' },
      { row: 6, body: 'odd ONE out?' },
      { row: 9, body: 'Find  x.' },
      { row: 12, body: 'Find x.' },
    ]
    expect(findDuplicates(rows, [])).toEqual(
      new Map([
        [6, 'Same as row 2'],
        [9, 'Same as row 5'],
        [12, 'Same as row 5'],
      ]),
    )
  })

  it('leaves blank questions to the row check', () => {
    expect(findDuplicates([{ row: 2, body: '' }, { row: 3, body: ' ' }], [{ code: 'Q1', body: '' }]).size).toBe(0)
  })
})

describe('checkImport', () => {
  it('adds extra cells and repeats to the row errors', () => {
    const rows = checkImport(
      [
        { row: 2, cells: cells(), overflow: false },
        { row: 3, cells: cells({ question: 'Which algorithm can STARVE a process?' }), overflow: true },
        { row: 4, cells: cells({ question: 'What is a deadlock?', exam: 'jee' }), overflow: false },
      ],
      { ...context, questions: [{ code: 'Q1050', body: 'What is a deadlock?' }] },
    )
    expect(rows.map((row) => row.errors)).toEqual([
      [],
      ['The row has more cells than the header. Check for a comma outside quotes.', 'Same as row 2'],
      ['There\'s no exam "jee". Give an exam\'s slug or name.', 'Same as Q1050'],
    ])
    expect(rows.map((row) => row.input === null)).toEqual([false, true, true])
  })
})

describe('questionsCsv', () => {
  it('writes a code column first, then the template columns, by code', () => {
    const lines = questionsCsv(
      [question({ id: 'q-2', code: 'Q1010', body: 'Second' }), question({ code: 'Q999', body: 'First' })],
      { exams, formulas },
    ).split('\r\n')
    expect(lines[0]).toBe(`code,${HEADER}`)
    expect(lines.slice(1).map((line) => line.split(',').slice(0, 4))).toEqual([
      ['Q999', 'gate-cse', 'operating-systems', 'scheduling'],
      ['Q1010', 'gate-cse', 'operating-systems', 'scheduling'],
    ])
  })

  const roundTrip = (q: Question) => {
    const [row] = checkImport(rowsOf(questionsCsv([q], { exams, formulas })), context)
    expect(row.errors).toEqual([])
    return row.input
  }

  /** The columns import fills in, from a saved question. */
  const inputOf = (q: Question) => ({
    topic_id: q.topic_id,
    subtopic: q.subtopic,
    difficulty: q.difficulty,
    type: q.type,
    year: q.year,
    source: q.source,
    body: q.body,
    options: q.options,
    answer_index: q.answer_index,
    hint: q.hint,
    explanation: q.explanation,
    formula_id: q.formula_id,
    tags: q.tags,
    status: q.status,
  })

  it.each([
    ['a plain draft', question({ status: 'draft', explanation: null })],
    [
      'one with every field, commas, quotes, line breaks, Hindi and ₹',
      question({
        topic_id: 'topic-3',
        subtopic: 'Discount, markup',
        difficulty: 'hard',
        type: 'pyq',
        year: 2019,
        source: 'SSC CGL 2019 "Tier 2"',
        body: 'एक वस्तु ₹720 में बेचने पर 10% हानि होती है।\nCost price, in ₹?',
        options: ['₹800', '-₹80', '=SUM(A1)', '@home', '+5%', 'None, of these'],
        answer_index: 0,
        hint: 'SP = 90% of CP.',
        explanation: 'CP = 720 / 0.9 = ₹800.\r\nSo the answer is "₹800".',
        formula_id: 'formula-1',
        tags: ['cost price', 'हानि'],
        status: 'in_review',
      }),
    ],
  ])('reads back %s as the same question', (_, q) => {
    // Line breaks come back as \n, as the editor saves them.
    expect(roundTrip(q)).toEqual({ ...inputOf(q), explanation: q.explanation?.replace(/\r\n/g, '\n') ?? null })
  })

  it('escapes cells Excel would run as formulas', () => {
    const csv = questionsCsv([question({ options: ['=1+1', '-x', 'ok'] })], { exams, formulas })
    expect(csv).toContain(`"'=1+1","'-x",ok`)
  })
})

describe('templateCsv', () => {
  it('has the header and two example rows that import as they are', () => {
    const csv = templateCsv(exams)
    expect(csv.split('\r\n')[0]).toBe(HEADER)
    const rows = checkImport(rowsOf(csv), context)
    expect(rows.map((row) => row.errors)).toEqual([[], []])
    expect(rows.map((row) => row.input?.topic_id)).toEqual(['topic-1', 'topic-1'])
    expect(rows.map((row) => row.input?.status)).toEqual(['draft', 'published'])
  })
})

describe('exportFileName', () => {
  it('has the local date', () => {
    expect(exportFileName(new Date(2026, 0, 5, 23, 30))).toBe('vprep-questions-2026-01-05.csv')
  })
})
