// A counter bumped whenever an admin adds, edits, publishes or deletes
// content, so cached copies (the exam catalog) can tell they are out of date
// and fetch again. Search and the formula library fetch on every visit, so
// they need nothing more.
let revision = 0

/** Changes every time an admin changes the content. */
export const contentRevision = () => revision

/** Marks every cached copy of the content as out of date. */
export function contentChanged() {
  revision++
}
