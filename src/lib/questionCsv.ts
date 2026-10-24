import Papa, { type UnparseConfig } from 'papaparse'
import type { Difficulty, Formula, Question, QuestionStatus, QuestionType } from '../types'
import { optionLetter } from './attempts'
import {
  blankOptions,
  MIN_OPTIONS,
  parseTags,
  parseYear,
  questionErrors,
  questionInput,
  YEAR_MAX,
  YEAR_MIN,
  type QuestionForm,
  type QuestionInput,
} from './questions'

// Questions as CSV, one row per question, for the admin's bulk import and
// export. A row is held to the editor's rules (questionErrors), with messages
// that name the file's columns and values instead of the editor's fields.

/** One column per option; as many as MAX_OPTIONS. */
const OPTION_COLUMNS = ['option_a', 'option_b', 'option_c', 'option_d', 'option_e', 'option_f'] as const
type OptionColumn = (typeof OPTION_COLUMNS)[number]

/** The columns, in the template's order. */
export const CSV_COLUMNS = [
  'exam',
  'subject',
  'topic',
  'subtopic',
  'difficulty',
  'type',
  'year',
  'source',
  'question',
  ...OPTION_COLUMNS,
  'answer',
  'hint',
  'explanation',
  'formula',
  'tags',
  'status',
] as const
export type CsvColumn = (typeof CSV_COLUMNS)[number]

/** A row's cells by column; '' for a blank cell or a column the file leaves out. */
export type CsvCells = Record<CsvColumn, string>

/** The columns a file must have. Any other may be left out, and is then blank in every row. */
const REQUIRED_COLUMNS: CsvColumn[] = ['exam', 'subject', 'topic', 'question', 'option_a', 'option_b', 'answer']

/** The export's first column, the question's code. Ignored on import, as the database gives codes. */
const CODE_COLUMN = 'code'

export const MAX_IMPORT_ROWS = 500

/** Far more than 500 questions need, so a wrong file is turned down before it is read. */
const MAX_FILE_MB = 5

/** Semicolons, as the template has them. Commas, as the editor has them, work too: no tag has one. */
const TAG_SEPARATOR = /[;,]/

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']
const TYPES: QuestionType[] = ['practice', 'pyq']
const STATUSES: QuestionStatus[] = ['draft', 'in_review', 'published']

/** Excel opens a file with this at the start as UTF-8, so Hindi and ₹ show as they should. */
const BOM = '\ufeff'

const UNPARSE: UnparseConfig = {
  // Excel would run a cell starting with = + - or @ as a formula ("-x" shows
  // #NAME?), so these get a ' first, which parsing takes off again.
  escapeFormulae: true,
  newline: '\r\n',
}

/** Q999 before Q1000. */
const byCode = new Intl.Collator('en', { numeric: true }).compare
const orList = new Intl.ListFormat('en', { type: 'disjunction' })
const andList = new Intl.ListFormat('en', { type: 'conjunction' })

const isBlank = (text: string) => text.trim() === ''
const quoted = (texts: string[]) => texts.map((text) => `"${text}"`)

// ---------------------------------------------------------------------
// Reading a file
// ---------------------------------------------------------------------

export interface CsvRow {
  /** Its row in the spreadsheet, counting the header as row 1. */
  row: number
  cells: CsvCells
  /** Has text past the last column, as a comma outside quotes leaves. */
  overflow: boolean
}

export type ParsedCsv = { rows: CsvRow[]; error?: undefined } | { rows?: undefined; error: string }

/** "Option A" or "option-a" → "option_a". */
const columnName = (header: string) => header.trim().toLowerCase().replace(/[\s-]+/g, '_')

/** Takes off the ' that export puts before = + - and @, and makes every line break \n. */
const cleanCell = (cell: string) => cell.replace(/^'(?=[=+\-@\t\r])/, '').replace(/\r\n?/g, '\n')

const blankCells = () => Object.fromEntries(CSV_COLUMNS.map((column) => [column, ''])) as CsvCells

/**
 * The questions in a CSV file's text, or what is wrong with the file as a
 * whole. Quoted cells may hold commas, quotes ("") and line breaks; a leading
 * BOM and blank rows are skipped.
 */
export function parseQuestionCsv(text: string): ParsedCsv {
  // Always commas: guessing could pick the semicolons between tags. Papa Parse drops a BOM itself.
  const { data, errors } = Papa.parse<string[]>(text, { delimiter: ',' })
  const quoteError = errors.find((error) => error.type === 'Quotes')
  if (quoteError) {
    return {
      error:
        `Row ${(quoteError.row ?? 0) + 1} has a quote (") that isn't closed or is out of place, so the file ` +
        `can't be read. A cell with quotes in it needs quotes around the whole cell, and each quote inside written twice ("").`,
    }
  }

  const headerIndex = data.findIndex((record) => !record.every(isBlank))
  if (headerIndex === -1) return { error: 'The file is empty.' }
  const header = data[headerIndex].map(columnName)
  const known = new Set<string>([...CSV_COLUMNS, CODE_COLUMN])
  const unknown = header.filter((name) => name !== '' && !known.has(name))
  if (unknown.length > 0) {
    return {
      error:
        `The header row has ${unknown.length === 1 ? 'a column' : 'columns'} not in the template: ` +
        `${andList.format(quoted(unknown.slice(0, 5)))}${unknown.length > 5 ? ' and more' : ''}. ` +
        'The first row must be the header, with the names as in the template.',
    }
  }
  const repeated = [...new Set(header.filter((name, i) => name !== '' && header.indexOf(name) !== i))]
  if (repeated.length > 0) return { error: `The header row has ${andList.format(quoted(repeated))} more than once.` }
  const missing = REQUIRED_COLUMNS.filter((name) => !header.includes(name))
  if (missing.length > 0) return { error: `The header row is missing ${andList.format(quoted(missing))}.` }

  const rows: CsvRow[] = []
  for (let i = headerIndex + 1; i < data.length; i++) {
    const record = data[i].map(cleanCell)
    if (record.every(isBlank)) continue
    const cells = blankCells()
    let overflow = false
    record.forEach((cell, j) => {
      const name = header[j]
      // Past the last column, or under a blank header cell.
      if (!name) overflow ||= !isBlank(cell)
      else if (name !== CODE_COLUMN) cells[name as CsvColumn] = cell
    })
    rows.push({ row: i + 1, cells, overflow })
  }
  if (rows.length === 0) return { error: 'The file has a header row but no questions under it.' }
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      error: `The file has ${rows.length} questions. Import at most ${MAX_IMPORT_ROWS} at a time: split it into smaller files.`,
    }
  }
  return { rows }
}

const SAVE_AS = 'In Excel use Save As → CSV UTF-8.'

/** The questions in a file the admin chose, or what is wrong with it. */
export async function readQuestionCsv(file: File): Promise<ParsedCsv> {
  if (!/\.csv$/i.test(file.name)) return { error: `${file.name} isn't a CSV file. ${SAVE_AS}` }
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    return { error: `The file is over ${MAX_FILE_MB} MB. Import at most ${MAX_IMPORT_ROWS} questions at a time.` }
  }
  let text: string
  try {
    // Fatal, so a file in another encoding is caught here rather than imported with � in it.
    text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
  } catch (err) {
    return {
      error:
        err instanceof TypeError
          ? `The file isn't saved as UTF-8, so some of its letters can't be read. ${SAVE_AS}`
          : "Couldn't read the file. Choose it again.",
    }
  }
  return parseQuestionCsv(text)
}

// ---------------------------------------------------------------------
// Checking rows
// ---------------------------------------------------------------------

interface Named {
  id: string
  slug: string
  name: string
}

/** Exams with their subjects and topics, as the catalog has them, to look rows up in. */
export interface CsvExam extends Named {
  subjects: Array<Named & { topics: Named[] }>
}

export interface ImportContext {
  exams: CsvExam[]
  formulas: Array<Pick<Formula, 'id' | 'slug'>>
  /** Every saved question, to find repeats of. */
  questions: Array<Pick<Question, 'code' | 'body'>>
}

export interface ImportRow {
  row: number
  cells: CsvCells
  /** As far down as the row's exam, subject and topic were found. */
  exam?: Named
  subject?: Named
  topic?: Named
  /** Its status, or null if the cell isn't one. */
  status: QuestionStatus | null
  /** What to insert; null while the row has errors. */
  input: QuestionInput | null
  /** Everything wrong with the row, in column order. */
  errors: string[]
}

const key = (text: string) => text.trim().toLowerCase()

/** The item with `text` as its slug, or else its name, ignoring case. */
function lookUp<T extends Named>(items: T[], text: string) {
  const wanted = key(text)
  return items.find((item) => item.slug === wanted) ?? items.find((item) => key(item.name) === wanted)
}

type Place = Pick<ImportRow, 'exam' | 'subject' | 'topic'> & { error?: string }

function findPlace(cells: CsvCells, exams: CsvExam[]): Place {
  if (isBlank(cells.exam)) return { error: "The exam is empty. Give the exam's slug or name." }
  const exam = lookUp(exams, cells.exam)
  if (!exam) return { error: `There's no exam "${cells.exam.trim()}". Give an exam's slug or name.` }
  if (isBlank(cells.subject)) return { exam, error: `The subject is empty. Give a subject of ${exam.name}.` }
  const subject = lookUp(exam.subjects, cells.subject)
  if (!subject) return { exam, error: `${exam.name} has no subject "${cells.subject.trim()}".` }
  if (isBlank(cells.topic)) return { exam, subject, error: `The topic is empty. Give a topic of ${subject.name}.` }
  const topic = lookUp(subject.topics, cells.topic)
  if (!topic) return { exam, subject, error: `${subject.name} has no topic "${cells.topic.trim()}".` }
  return { exam, subject, topic }
}

/** The value `text` names ("In review" → in_review), `fallback` when blank, or null when it isn't one. */
function choice<T extends string>(text: string, values: T[], fallback: T): T | null {
  const name = columnName(text)
  if (name === '') return fallback
  return values.find((value) => value === name) ?? null
}

const notOneOf = (column: string, values: string[], text: string) =>
  `The ${column} must be ${orList.format(values)}, not "${text.trim()}".`

/**
 * What is wrong with one row, and what to insert when nothing is: the
 * editor's rules and the table's constraints. Repeats are found by
 * checkImport, which sees every row.
 */
export function checkRow(cells: CsvCells, { exams, formulas }: Pick<ImportContext, 'exams' | 'formulas'>) {
  const { error: placeError, ...place } = findPlace(cells, exams)

  const difficulty = choice(cells.difficulty, DIFFICULTIES, 'medium')
  const type = choice(cells.type, TYPES, 'practice')
  const status = choice(cells.status, STATUSES, 'draft')

  const year = cells.year.trim()
  let yearError: string | undefined
  if (year !== '' && parseYear(year) === null) {
    yearError = `The year must be between ${YEAR_MIN} and ${YEAR_MAX}, not "${year}".`
  } else if (year !== '' && type === 'practice') {
    // The editor only keeps a year for a PYQ.
    yearError = 'Only a PYQ has a year. Set the type to pyq, or clear the year.'
  }

  // Up to the last option with text; any blank before it is a gap.
  const filled = OPTION_COLUMNS.map((column) => cells[column])
  const options = filled.slice(0, filled.findLastIndex((text) => !isBlank(text)) + 1)
  const gaps = blankOptions(options).map(optionLetter)
  let optionsError: string | undefined
  if (gaps.length > 0) {
    optionsError =
      `${gaps.length === 1 ? 'Option' : 'Options'} ${andList.format(gaps)} ${gaps.length === 1 ? 'is' : 'are'} ` +
      'empty, but a later option is filled in. Fill in the options from option_a, with no gaps.'
  } else if (options.length < MIN_OPTIONS) {
    optionsError = `Give at least ${MIN_OPTIONS} options, starting from option_a.`
  }

  const answer = cells.answer.trim().toUpperCase()
  const answerIndex = /^[A-Z]$/.test(answer) ? answer.charCodeAt(0) - 65 : null
  const letters = `A to ${optionLetter(Math.max(options.length, MIN_OPTIONS) - 1)}`
  let answerError: string | undefined
  if (answer === '') answerError = `The answer is empty. Give the letter of the correct option, ${letters}.`
  else if (answerIndex === null) answerError = `The answer must be a letter, ${letters}, not "${cells.answer.trim()}".`
  else if (answerIndex >= options.length) answerError = `The answer is ${answer}, but there's no option ${answer}.`

  const formulaSlug = key(cells.formula)
  const formula = formulaSlug ? formulas.find((f) => f.slug === formulaSlug) : undefined

  const form: QuestionForm = {
    examId: place.exam?.id ?? '',
    subjectId: place.subject?.id ?? '',
    topicId: place.topic?.id ?? '',
    subtopic: cells.subtopic,
    tags: '',
    body: cells.question,
    options,
    answerIndex,
    hint: cells.hint,
    explanation: cells.explanation,
    formulaId: formula?.id ?? '',
    // A value that isn't valid is already an error; these stand in for it.
    difficulty: difficulty ?? 'medium',
    type: type ?? 'practice',
    year,
    source: cells.source,
    status: status ?? 'draft',
  }
  const rules = questionErrors(form)

  // In column order. The editor's messages stand in for any rule the ones here miss.
  const errors = [
    placeError ?? rules.topic,
    difficulty ? undefined : notOneOf('difficulty', DIFFICULTIES, cells.difficulty),
    type ? undefined : notOneOf('type', TYPES, cells.type),
    yearError ?? rules.year,
    rules.body && 'The question is empty.',
    optionsError ?? rules.options,
    answerError ?? rules.answer,
    rules.explanation && 'A published question needs an explanation. Add one, or set the status to draft or in_review.',
    formulaSlug && !formula ? `There's no formula with the slug "${cells.formula.trim()}".` : undefined,
    status ? undefined : notOneOf('status', STATUSES, cells.status),
  ].filter((error): error is string => !!error)

  const input: QuestionInput | null =
    errors.length === 0 ? { ...questionInput(form), tags: parseTags(cells.tags, TAG_SEPARATOR) } : null
  return { ...place, status, input, errors }
}

/** The question text compared for repeats: case and runs of spaces don't count. */
const questionKey = (body: string) => body.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Rows whose question is already saved ("Same as Q1023") or repeats an
 * earlier row of the file ("Same as row 5"), by row.
 */
export function findDuplicates(
  rows: Array<{ row: number; body: string }>,
  saved: ImportContext['questions'],
): Map<number, string> {
  const savedCode = new Map<string, string>()
  for (const question of [...saved].sort((a, b) => byCode(a.code, b.code))) {
    const body = questionKey(question.body)
    if (!savedCode.has(body)) savedCode.set(body, question.code)
  }
  const firstRow = new Map<string, number>()
  const duplicates = new Map<number, string>()
  for (const { row, body } of rows) {
    const text = questionKey(body)
    if (text === '') continue
    const code = savedCode.get(text)
    const earlier = firstRow.get(text)
    if (code) duplicates.set(row, `Same as ${code}`)
    else if (earlier !== undefined) duplicates.set(row, `Same as row ${earlier}`)
    else firstRow.set(text, row)
  }
  return duplicates
}

const OVERFLOW = 'The row has more cells than the header. Check for a comma outside quotes.'

/** Every row of a file with what is wrong with it, ready to preview. */
export function checkImport(rows: CsvRow[], context: ImportContext): ImportRow[] {
  const duplicates = findDuplicates(
    rows.map(({ row, cells }) => ({ row, body: cells.question })),
    context.questions,
  )
  return rows.map(({ row, cells, overflow }) => {
    const checked = checkRow(cells, context)
    const duplicate = duplicates.get(row)
    const errors = [...(overflow ? [OVERFLOW] : []), ...checked.errors, ...(duplicate ? [duplicate] : [])]
    return { row, cells, ...checked, input: errors.length === 0 ? checked.input : null, errors }
  })
}

// ---------------------------------------------------------------------
// Writing a file
// ---------------------------------------------------------------------

const optionCells = (options: string[]) =>
  Object.fromEntries(OPTION_COLUMNS.map((column, i) => [column, options[i] ?? ''])) as Record<OptionColumn, string>

/** A saved question's cells, which import reads back as the same question. */
function questionCells(question: Question, place: Place | undefined, formulaSlug: string): CsvCells {
  return {
    exam: place?.exam?.slug ?? '',
    subject: place?.subject?.slug ?? '',
    topic: place?.topic?.slug ?? '',
    subtopic: question.subtopic ?? '',
    difficulty: question.difficulty,
    type: question.type,
    year: question.year === null ? '' : String(question.year),
    source: question.source ?? '',
    question: question.body,
    ...optionCells(question.options),
    answer: optionLetter(question.answer_index),
    hint: question.hint ?? '',
    explanation: question.explanation ?? '',
    formula: formulaSlug,
    tags: question.tags.join('; '),
    status: question.status,
  }
}

/** Every topic by id, with its exam and subject. */
function placesOf(exams: CsvExam[]) {
  const places = new Map<string, Place>()
  for (const exam of exams) {
    for (const subject of exam.subjects) {
      for (const topic of subject.topics) places.set(topic.id, { exam, subject, topic })
    }
  }
  return places
}

/** Questions as a CSV file's text, by code, with a "code" column first. */
export function questionsCsv(questions: Question[], { exams, formulas }: Pick<ImportContext, 'exams' | 'formulas'>) {
  const places = placesOf(exams)
  const formulaSlugs = new Map(formulas.map((f) => [f.id, f.slug]))
  const data = [...questions]
    .sort((a, b) => byCode(a.code, b.code))
    .map((question) => {
      const formulaSlug = question.formula_id ? (formulaSlugs.get(question.formula_id) ?? '') : ''
      const cells = questionCells(question, places.get(question.topic_id), formulaSlug)
      return [question.code, ...CSV_COLUMNS.map((column) => cells[column])]
    })
  return Papa.unparse({ fields: [CODE_COLUMN, ...CSV_COLUMNS], data }, UNPARSE)
}

const EXAMPLES: Array<Partial<CsvCells>> = [
  {
    subtopic: 'Discount',
    difficulty: 'easy',
    type: 'practice',
    question: 'A shirt marked ₹800 is sold at a 10% discount. What is its selling price?',
    ...optionCells(['₹700', '₹720', '₹740', '₹760']),
    answer: 'B',
    hint: 'Take 10% off the marked price.',
    explanation: 'The discount is 10% of ₹800 = ₹80, so the selling price is ₹800 − ₹80 = ₹720.',
    tags: 'discount; selling price',
    status: 'draft',
  },
  {
    difficulty: 'medium',
    type: 'pyq',
    year: '2023',
    source: 'SSC CGL 2023 Tier 1',
    question: 'Which number is the odd one out?\n3, 5, 9, 11, 13',
    ...optionCells(['3', '5', '9', '11', '13']),
    answer: 'C',
    explanation: 'All the others are prime. 9 = 3 × 3.',
    tags: 'primes',
    status: 'published',
  },
]

/**
 * The header and two example rows, in the first topic of the catalog so the
 * file imports as it is.
 */
export function templateCsv(exams: CsvExam[]) {
  const exam = exams.find((e) => e.subjects.some((s) => s.topics.length > 0))
  const subject = exam?.subjects.find((s) => s.topics.length > 0)
  const place = {
    exam: exam?.slug ?? 'ssc-cgl',
    subject: subject?.slug ?? 'quantitative-aptitude',
    topic: subject?.topics[0].slug ?? 'percentage',
  }
  const data = EXAMPLES.map((example) => {
    const cells = { ...blankCells(), ...place, ...example }
    return CSV_COLUMNS.map((column) => cells[column])
  })
  return Papa.unparse({ fields: [...CSV_COLUMNS], data }, UNPARSE)
}

export const TEMPLATE_FILE_NAME = 'vprep-questions-template.csv'

/** "vprep-questions-2026-10-24.csv", with the local date. */
export function exportFileName(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `vprep-questions-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.csv`
}

/** Saves `csv` as a file, with a BOM for Excel. */
export function downloadCsv(fileName: string, csv: string) {
  const url = URL.createObjectURL(new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // Later, as some browsers only start reading it once click() has returned.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
