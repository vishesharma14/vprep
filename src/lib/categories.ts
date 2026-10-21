import type { ExamCategory } from '../types'

/** Exam categories in display order, with their labels. */
export const CATEGORIES: Array<{ id: ExamCategory; label: string }> = [
  { id: 'government', label: 'Government' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'medical', label: 'Medical' },
  { id: 'placement', label: 'Placement' },
  { id: 'certification', label: 'Certification' },
]

export function categoryLabel(category: ExamCategory) {
  return CATEGORIES.find((c) => c.id === category)?.label ?? category
}

/** For values from the URL, e.g. ?category=engineering. */
export function isExamCategory(value: string | null): value is ExamCategory {
  return CATEGORIES.some((c) => c.id === value)
}
