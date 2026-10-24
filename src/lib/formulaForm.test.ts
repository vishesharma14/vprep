import { describe, expect, it } from 'vitest'
import type { Formula } from '../types'
import { formulaErrors, formulaFormOf, formulaInput, formulaSaveError, NEW_FORMULA, renameFormula } from './formulaForm'

const formula = (fields: Partial<Formula> = {}): Formula => ({
  id: 'f-1',
  slug: 'simple-interest',
  group_name: 'Arithmetic',
  name: 'Simple interest',
  expression: 'SI = P × R × T / 100',
  note: null,
  created_at: '2026-01-01T00:00:00Z',
  ...fields,
})

const filled = { name: 'Compound interest', slug: 'compound-interest', group: 'Arithmetic', expression: 'A = P(1 + r)^n', note: '' }

describe('formulaErrors', () => {
  it('finds nothing wrong with a filled-in form', () => {
    expect(formulaErrors(filled, [formula()])).toEqual({})
  })

  it('flags every required field on a new form', () => {
    expect(formulaErrors(NEW_FORMULA, [])).toEqual({
      name: 'Name the formula.',
      slug: 'Add a slug, made of lowercase letters and digits.',
      group: 'Choose a group, or type a new one.',
      expression: 'Write the formula.',
    })
  })

  it('treats spaces as empty', () => {
    const errors = formulaErrors({ ...filled, name: '  ', group: ' ', expression: '\n' }, [])
    expect(Object.keys(errors).sort()).toEqual(['expression', 'group', 'name'])
  })

  it("rejects another formula's slug", () => {
    expect(formulaErrors({ ...filled, slug: 'simple-interest' }, [formula()]).slug).toBe(
      'Another formula already uses this slug. Change it, or the name.',
    )
  })

  it('rejects a badly formed slug', () => {
    expect(formulaErrors({ ...filled, slug: 'Compound Interest' }, []).slug).toBe(
      'Use only lowercase letters and digits, with single dashes between words.',
    )
  })

  it('does not require a note', () => {
    expect(formulaErrors({ ...filled, note: '' }, []).note).toBeUndefined()
  })
})

describe('renameFormula', () => {
  it('moves the slug with the name while it matches', () => {
    const form = renameFormula({ ...NEW_FORMULA, name: 'Speed', slug: 'speed' }, 'Speed & Distance')
    expect(form).toMatchObject({ name: 'Speed & Distance', slug: 'speed-distance' })
  })

  it('leaves a hand-edited slug alone', () => {
    const form = renameFormula({ ...NEW_FORMULA, name: 'Speed', slug: 'velocity' }, 'Speed & Distance')
    expect(form.slug).toBe('velocity')
  })
})

describe('formulaFormOf', () => {
  it('fills the form from a formula, with an empty note for null', () => {
    expect(formulaFormOf(formula())).toEqual({
      name: 'Simple interest',
      slug: 'simple-interest',
      group: 'Arithmetic',
      expression: 'SI = P × R × T / 100',
      note: '',
    })
  })
})

describe('formulaInput', () => {
  it('trims the text and saves a blank note as null', () => {
    expect(formulaInput({ ...filled, name: ' Compound interest ', group: ' Arithmetic', note: '   ' })).toEqual({
      slug: 'compound-interest',
      group_name: 'Arithmetic',
      name: 'Compound interest',
      expression: 'A = P(1 + r)^n',
      note: null,
    })
  })

  it('keeps a note', () => {
    expect(formulaInput({ ...filled, note: ' r is per period ' }).note).toBe('r is per period')
  })
})

describe('formulaSaveError', () => {
  it('explains a duplicate slug', () => {
    const error = { message: 'duplicate key value violates unique constraint "formulas_slug_key"' }
    expect(formulaSaveError(error)).toBe('Another formula already uses this slug. Change it, or the name.')
  })

  it('explains a slug the database turned down', () => {
    const error = { message: 'new row for relation "formulas" violates check constraint "formulas_slug_check"' }
    expect(formulaSaveError(error)).toMatch(/^Use only lowercase letters/)
  })

  it('leaves other errors to the caller', () => {
    expect(formulaSaveError({ message: 'permission denied for table formulas' })).toBeNull()
  })
})
