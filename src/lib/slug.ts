// Exams, subjects, topics and formulas each have a slug, which the database
// checks against SLUG_PATTERN (db/migrations/0001_schema.sql). Exam slugs are
// in addresses: /exams/ssc-cgl.

/** Lowercase letters and digits, with single dashes between: "profit-loss". */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** "Profit & Loss" → "profit-loss". Accents are dropped: "Café" → "cafe". */
export function slugify(text: string) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** The slug once the name changes: it follows the name for as long as it still matches it. */
export function followName(slug: string, oldName: string, newName: string) {
  return slug === slugify(oldName) ? slugify(newName) : slug
}

/** What is wrong with a slug typed into a form, or undefined. `taken`: slugs it must differ from. */
export function slugError(slug: string, taken: readonly string[], takenMessage: string) {
  if (!slug) return 'Add a slug, made of lowercase letters and digits.'
  if (!SLUG_PATTERN.test(slug)) return 'Use only lowercase letters and digits, with single dashes between words.'
  if (taken.includes(slug)) return takenMessage
}
