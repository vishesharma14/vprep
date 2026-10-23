import type { Formula } from '../types'
import { dbErrorMessage, SESSION_EXPIRED } from './errors'
import { neon } from './neon'
import { withSessionRecovery } from './session'

/** Groups in this order; any others follow, A to Z. */
const GROUP_ORDER = [
  'Arithmetic',
  'Algebra & Calculus',
  'Trigonometry & Logs',
  'Physics',
  'Chemistry',
  'Computer Science',
  'Probability & Statistics',
]

const byName = new Intl.Collator('en', { numeric: true }).compare

/** Every formula, by group then name. */
export async function fetchFormulas() {
  const { data, error, status, expired } = await withSessionRecovery(() =>
    neon.from('formulas').select('*').order('group_name').order('name'),
  )
  if (error) throw new Error(expired ? SESSION_EXPIRED : dbErrorMessage(error, status))
  return data as Formula[]
}

export interface FormulaGroup<T> {
  name: string
  formulas: T[]
}

/** Formulas by group (in GROUP_ORDER), each group A to Z. */
export function groupFormulas<T extends Pick<Formula, 'group_name' | 'name'>>(formulas: T[]): Array<FormulaGroup<T>> {
  const groups = new Map<string, T[]>()
  for (const formula of [...formulas].sort((a, b) => byName(a.name, b.name))) {
    groups.set(formula.group_name, [...(groups.get(formula.group_name) ?? []), formula])
  }
  const rank = (group: string) => {
    const index = GROUP_ORDER.indexOf(group)
    return index === -1 ? GROUP_ORDER.length : index
  }
  return [...groups]
    .sort(([a], [b]) => rank(a) - rank(b) || byName(a, b))
    .map(([name, formulas]) => ({ name, formulas }))
}
