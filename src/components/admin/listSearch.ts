// The screens opened from the Questions list (the editor, the CSV import) get
// the list's query string in their location state, so Save, Cancel and Back
// return to the list as it was: same search, filters and sort.

/** The whole list, for a screen opened some other way. */
export const DEFAULT_LIST = '?tab=questions'

export function listSearchOf(state: unknown) {
  const list = (state as { list?: unknown } | null)?.list
  return typeof list === 'string' && list.startsWith('?tab=questions') ? list : DEFAULT_LIST
}
