/**
 * The words of a search, lowercased and split on whitespace as
 * search_questions() splits them: " GATE  scheduling" → ["gate", "scheduling"].
 */
export function searchWords(query: string) {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

/** True when every word appears in one of `fields`, ignoring case. Partial words match. */
export function matchesEveryWord(fields: Array<string | null>, words: string[]) {
  const text = fields.join('\n').toLowerCase()
  return words.every((word) => text.includes(word))
}
