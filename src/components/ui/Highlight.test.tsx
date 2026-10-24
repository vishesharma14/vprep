import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Highlight } from './Highlight'

// Rendered to HTML, with the mark's classes left out so the tests read as text.
const highlight = (text: string, words: string[]) =>
  renderToStaticMarkup(<Highlight text={text} words={words} />).replace(/<mark [^>]*>/g, '<mark>')

describe('Highlight', () => {
  it('marks every match, ignoring case and keeping the original case', () => {
    expect(highlight('Mole fraction and moles', ['mole'])).toBe('<mark>Mole</mark> fraction and <mark>mole</mark>s')
  })

  it('marks each of several words', () => {
    expect(highlight('GATE scheduling question', ['gate', 'scheduling'])).toBe(
      '<mark>GATE</mark> <mark>scheduling</mark> question',
    )
  })

  it('prefers the longest word where two overlap', () => {
    expect(highlight('Probability problems', ['prob', 'probability'])).toBe(
      '<mark>Probability</mark> <mark>prob</mark>lems',
    )
  })

  it('treats regular expression characters as plain text', () => {
    expect(highlight('C++ and (a+b)^2 cost $5.00', ['c++', '(a+b)^2', '$5.00'])).toBe(
      '<mark>C++</mark> and <mark>(a+b)^2</mark> cost <mark>$5.00</mark>',
    )
    expect(highlight('a.b axb', ['a.b'])).toBe('<mark>a.b</mark> axb')
  })

  it('shows the text unchanged with no words', () => {
    expect(highlight('Nothing to mark', [])).toBe('Nothing to mark')
  })

  it('shows the text unchanged when nothing matches', () => {
    expect(highlight('Nothing to mark', ['paging'])).toBe('Nothing to mark')
  })

  it('escapes HTML in the text', () => {
    expect(highlight('<b>bold</b> claim', ['claim'])).toBe('&lt;b&gt;bold&lt;/b&gt; <mark>claim</mark>')
  })
})
