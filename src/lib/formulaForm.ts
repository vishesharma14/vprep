import type { Formula } from '../types'
import { adminWrite, constraintOf, type DbError } from './admin'
import { contentChanged } from './content'
import { neon } from './neon'
import { followName, slugError } from './slug'

// The admin's formula form: its rules, and saving and deleting. Apart from
// formulas.ts, which learners' pages use, so they never download this.

/** The columns the admin form writes. */
export type FormulaInput = Pick<Formula, 'slug' | 'group_name' | 'name' | 'expression' | 'note'>

/** The form's fields as typed. */
export interface FormulaForm {
  name: string
  slug: string
  group: string
  expression: string
  note: string
}

export const NEW_FORMULA: FormulaForm = { name: '', slug: '', group: '', expression: '', note: '' }

export const formulaFormOf = (formula: Formula): FormulaForm => ({
  name: formula.name,
  slug: formula.slug,
  group: formula.group_name,
  expression: formula.expression,
  note: formula.note ?? '',
})

/** The form after the name changes; the slug follows it while it matches. */
export const renameFormula = (form: FormulaForm, name: string): FormulaForm => ({
  ...form,
  name,
  slug: followName(form.slug, form.name, name),
})

export type FormulaErrors = Partial<Record<keyof FormulaForm, string>>

/** What is wrong with the form, by field. `others`: every other formula, whose slugs it must not reuse. */
export function formulaErrors(form: FormulaForm, others: Formula[]): FormulaErrors {
  const errors: FormulaErrors = {}
  if (!form.name.trim()) errors.name = 'Name the formula.'
  const slug = slugError(
    form.slug,
    others.map((f) => f.slug),
    'Another formula already uses this slug. Change it, or the name.',
  )
  if (slug) errors.slug = slug
  if (!form.group.trim()) errors.group = 'Choose a group, or type a new one.'
  if (!form.expression.trim()) errors.expression = 'Write the formula.'
  return errors
}

/** The row to save, from a form with no errors. */
export const formulaInput = (form: FormulaForm): FormulaInput => ({
  slug: form.slug,
  group_name: form.group.trim(),
  name: form.name.trim(),
  expression: form.expression.trim(),
  note: form.note.trim() || null,
})

/** Clearer words for a save the database turned down; null for any other error. */
export function formulaSaveError(error: DbError) {
  const constraint = constraintOf(error)
  if (constraint === 'formulas_slug_key') return 'Another formula already uses this slug. Change it, or the name.'
  if (constraint === 'formulas_slug_check') {
    return 'Use only lowercase letters and digits in the slug, with single dashes between words.'
  }
  return null
}

const NOT_FOUND = "Couldn't find this formula. It may have been deleted. Reload the page and try again."

export type FormulaSaveResult = { formula: Formula; error?: undefined } | { formula?: undefined; error: string }

/** Adds a formula (`id` null) or saves changes to one. Resolves to the saved row, or an error message. */
export async function saveFormula(input: FormulaInput, id: string | null): Promise<FormulaSaveResult> {
  const result = await adminWrite<Formula>(
    () => (id ? neon.from('formulas').update(input).eq('id', id).select() : neon.from('formulas').insert(input).select()),
    formulaSaveError,
  )
  if (result.error !== undefined) return { error: result.error }
  const formula = result.rows[0]
  if (!formula) return { error: NOT_FOUND }
  contentChanged()
  return { formula }
}

/**
 * Deletes a formula; the database unlinks it from its questions. Resolves to
 * null once deleted, or an error message.
 */
export async function deleteFormula(id: string): Promise<string | null> {
  const result = await adminWrite<{ id: string }>(() => neon.from('formulas').delete().eq('id', id).select('id'))
  if (result.error !== undefined) return result.error
  if (result.rows.length === 0) return NOT_FOUND
  contentChanged()
  return null
}
