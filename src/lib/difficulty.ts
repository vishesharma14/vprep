import type { AdminQuestionDifficultyRow, Difficulty } from '../types'
import { plural } from './format'

// Data-driven difficulty: ml/fit_difficulty.py fits a Rasch model to learners'
// first answers and admin_question_difficulty() reads the result. The levels
// are worked out there; these numbers match ml/rasch.py, for the wording.

/** First answers a question needs before the data gives it a level. */
export const MIN_FIRST_ANSWERS = 20
/** Easy from this chance that an average learner gets it right… */
export const EASY_FROM = 0.7
/** …and hard below this one. */
export const HARD_BELOW = 0.4

/** Fits the model again: run from the project folder with ml/.venv active (see ml/README.md). */
export const FIT_DIFFICULTY_COMMAND = 'python ml/fit_difficulty.py'

export const LEVELS: Difficulty[] = ['easy', 'medium', 'hard']

export const LEVEL_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

/** "Hard · 40 answers"; null while the question has no level. */
export function dataSaysLabel(row: Pick<AdminQuestionDifficultyRow, 'estimated_level' | 'responses'> | undefined) {
  if (!row?.estimated_level) return null
  return `${LEVEL_LABEL[row.estimated_level]} · ${plural(row.responses ?? 0, 'answer')}`
}

/** Why a question has no level yet, with how far it has got. */
export function needsAnswersNote(responses: number | null | undefined) {
  const note = `Needs ${MIN_FIRST_ANSWERS} first answers`
  return responses ? `${note} (has ${responses})` : note
}

/** Questions per level set (rows) and level estimated (columns, `none` without one). */
export type LevelTable = Record<Difficulty, Record<Difficulty | 'none', number>>

export function levelTable(rows: AdminQuestionDifficultyRow[]): LevelTable {
  const empty = () => ({ easy: 0, medium: 0, hard: 0, none: 0 })
  const table: LevelTable = { easy: empty(), medium: empty(), hard: empty() }
  for (const row of rows) table[row.set_level][row.estimated_level ?? 'none'] += 1
  return table
}

const RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 }

/** The chances of a right answer, for an average learner, that each level covers. */
const BAND: Record<Difficulty, [number, number]> = {
  easy: [EASY_FROM, 1],
  medium: [HARD_BELOW, EASY_FROM],
  hard: [0, HARD_BELOW],
}

export interface Mismatch {
  row: AdminQuestionDifficultyRow
  estimated: Difficulty
  /** Levels apart: 2 for easy against hard. */
  gap: number
  /** How far the chance of a right answer is outside the set level's band, 0–1. */
  distance: number
}

/** Q999 before Q1000. */
const byCode = new Intl.Collator('en', { numeric: true }).compare

/**
 * Questions whose estimated level isn't the one set, biggest first: two
 * levels apart before one, then furthest outside the set level's band.
 */
export function mismatches(rows: AdminQuestionDifficultyRow[]): Mismatch[] {
  const found: Mismatch[] = []
  for (const row of rows) {
    const estimated = row.estimated_level
    if (!estimated || estimated === row.set_level || row.p_average === null) continue
    const [low, high] = BAND[row.set_level]
    found.push({
      row,
      estimated,
      gap: Math.abs(RANK[estimated] - RANK[row.set_level]),
      distance: Math.max(low - row.p_average, row.p_average - high, 0),
    })
  }
  return found.sort((a, b) => b.gap - a.gap || b.distance - a.distance || byCode(a.row.code, b.row.code))
}

/** What the last fit covered. `fittedAt` is null before the first fit. */
export function difficultySummary(rows: AdminQuestionDifficultyRow[]) {
  // One fit writes every row at once, so they share a time; the latest wins if not.
  const times = rows.flatMap((row) => (row.fitted_at === null ? [] : [row.fitted_at])).sort()
  return {
    fitted: times.length,
    withLevel: rows.filter((row) => row.estimated_level !== null).length,
    firstAnswers: rows.reduce((total, row) => total + (row.responses ?? 0), 0),
    fittedAt: times.at(-1) ?? null,
  }
}
