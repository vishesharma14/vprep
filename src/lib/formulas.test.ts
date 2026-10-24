import { describe, expect, it } from 'vitest'
import { groupFormulas } from './formulas'

describe('groupFormulas', () => {
  const f = (group_name: string, name: string) => ({ group_name, name })

  it('puts groups in the set order, then any others A to Z', () => {
    const groups = groupFormulas([
      f('Zoology', 'Z1'),
      f('Physics', 'P1'),
      f('Arithmetic', 'A1'),
      f('Botany', 'B1'),
      f('Chemistry', 'C1'),
    ])
    expect(groups.map((g) => g.name)).toEqual(['Arithmetic', 'Physics', 'Chemistry', 'Botany', 'Zoology'])
  })

  it('sorts formulas A to Z within a group, numbers by value', () => {
    const groups = groupFormulas([f('Physics', 'Law 10'), f('Physics', 'law 2'), f('Physics', 'Kinetic energy')])
    expect(groups[0].formulas.map((x) => x.name)).toEqual(['Kinetic energy', 'law 2', 'Law 10'])
  })

  it('leaves the list it was given in its order', () => {
    const formulas = [f('Physics', 'b'), f('Physics', 'a')]
    groupFormulas(formulas)
    expect(formulas.map((x) => x.name)).toEqual(['b', 'a'])
  })

  it('is empty for no formulas', () => {
    expect(groupFormulas([])).toEqual([])
  })
})
