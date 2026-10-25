import type { StudyPlanRow } from '../types'
import { plural } from './format'

/** Mastery as a whole percent, 0–100. */
export function masteryPercent(mastery: number) {
  return Math.min(100, Math.max(0, Math.round(mastery * 100)))
}

/** One line saying why recommend_topics() picked the topic, built from the numbers it returned. */
export function planReason(row: StudyPlanRow) {
  switch (row.kind) {
    case 'mistakes':
      return `${plural(row.open_mistakes, 'mistake')} to fix · mastery ${masteryPercent(row.mastery)}%`
    case 'weak':
      return `Estimated mastery ${masteryPercent(row.mastery)}% over ${plural(row.answered, 'answer')}`
    case 'due':
      return `Last practised ${plural(row.days_since, 'day')} ago, time to review`
    case 'review':
      return 'Keep it fresh'
    case 'new':
      return `New topic · ${plural(row.new_questions, 'question')}`
  }
}

/**
 * Where a topic's Practise button goes. Revision has no per-topic list of
 * mistakes, so a topic with mistakes is practised in full like the rest.
 */
export const planHref = (row: StudyPlanRow) => `/practice?topic=${row.topic_id}`
