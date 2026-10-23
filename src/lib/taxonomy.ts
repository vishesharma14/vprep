import type { ExamCategory } from '../types'
import { constraintOf, type DbError } from './admin'
import { followName, slugError } from './slug'

// The rules the exams, subjects and topics tables enforce
// (db/migrations/0001_schema.sql), checked in the forms first.

export type Level = 'exam' | 'subject' | 'topic'

export const TABLE: Record<Level, string> = { exam: 'exams', subject: 'subjects', topic: 'topics' }

/** Longest name the database accepts. */
export const NAME_MAX: Record<Level, number> = { exam: 60, subject: 80, topic: 80 }

/** An exam's columns the admin form writes; position is set when it is added. */
export interface ExamInput {
  slug: string
  name: string
  full_name: string | null
  category: ExamCategory
}

/** The exam form's fields as typed. `category` is '' until one is chosen. */
export interface ExamForm {
  name: string
  fullName: string
  category: ExamCategory | ''
  slug: string
}

export const NEW_EXAM: ExamForm = { name: '', fullName: '', category: '', slug: '' }

/** The form after the name changes; the slug follows it while it matches. */
export const renameExam = (form: ExamForm, name: string): ExamForm => ({
  ...form,
  name,
  slug: followName(form.slug, form.name, name),
})

export type ExamErrors = Partial<Record<keyof ExamForm, string>>

/**
 * What is wrong with the exam form, by field. `takenSlugs`: the other exams'
 * slugs; null when editing, as an exam's slug is in its address and stays.
 */
export function examErrors(form: ExamForm, takenSlugs: string[] | null): ExamErrors {
  const errors: ExamErrors = {}
  const name = nameError('exam', form.name)
  if (name) errors.name = name
  if (!form.category) errors.category = 'Choose a category.'
  if (takenSlugs) {
    const slug = slugError(form.slug, takenSlugs, 'Another exam already uses this slug. Change it, or the name.')
    if (slug) errors.slug = slug
  }
  return errors
}

export const examInput = (form: ExamForm & { category: ExamCategory }): ExamInput => ({
  slug: form.slug,
  name: form.name.trim(),
  full_name: form.fullName.trim() || null,
  category: form.category,
})

/** What is wrong with a name, or undefined. */
export function nameError(level: Level, name: string) {
  const length = name.trim().length
  if (length === 0) return `Give the ${level} a name.`
  if (length > NAME_MAX[level]) return `Keep the name to ${NAME_MAX[level]} characters.`
}

export interface Positioned {
  id: string
  position: number
}

/**
 * The new positions when the item at `index` of `items` (in the order shown)
 * swaps with its neighbour `step` away. Only the rows that change are
 * returned: the two swapped positions, or, when positions tie, 1, 2, 3… for
 * the whole list so the order shown is the order stored.
 */
export function reorder(items: Positioned[], index: number, step: -1 | 1): Positioned[] {
  const target = index + step
  if (target < 0 || target >= items.length) return []
  const order = items.map((item, i) => (i === index ? items[target] : i === target ? items[index] : item))
  const distinct = items.every((item, i) => i === 0 || item.position > items[i - 1].position)
  const slots = distinct ? items.map((item) => item.position) : items.map((_, i) => i + 1)
  return order.flatMap((item, i) => (item.position === slots[i] ? [] : [{ id: item.id, position: slots[i] }]))
}

/** The position that puts a new item last among `siblings`. */
export const nextPosition = (siblings: Positioned[]) => Math.max(0, ...siblings.map((s) => s.position)) + 1

/** Messages for the tables' constraints, by name. */
const CONSTRAINTS: Record<string, string> = {
  exams_slug_key: 'Another exam already uses this slug. Change it, or the name.',
  subjects_exam_id_slug_key: 'This exam already has a subject with this name. Choose another name.',
  topics_subject_id_slug_key: 'This subject already has a topic with this name. Choose another name.',
  exams_slug_check: 'Use only lowercase letters and digits in the slug, with single dashes between words.',
  subjects_slug_check: 'Use at least one letter or digit in the name.',
  topics_slug_check: 'Use at least one letter or digit in the name.',
  exams_name_check: `Give the exam a name of up to ${NAME_MAX.exam} characters.`,
  subjects_name_check: `Give the subject a name of up to ${NAME_MAX.subject} characters.`,
  topics_name_check: `Give the topic a name of up to ${NAME_MAX.topic} characters.`,
  exams_category_check: 'Choose a category.',
  // A topic, or a topic in the subject or exam being deleted, still has questions.
  questions_topic_id_fkey: "It still has questions, so it can't be deleted. Move or delete them first.",
  subjects_exam_id_fkey: 'This exam no longer exists. Reload the page.',
  topics_subject_id_fkey: 'This subject no longer exists. Reload the page.',
}

/** Clearer words for a change the database turned down; null for any other error. */
export function taxonomyError(error: DbError) {
  const constraint = constraintOf(error)
  return constraint ? (CONSTRAINTS[constraint] ?? null) : null
}
