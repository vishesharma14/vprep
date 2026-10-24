import type { PracticeQuestion } from '../hooks/usePracticeSet'
import type { Exam, MyProgressTotals, Question, Subject, Topic } from '../types'

// Rows for tests: sensible defaults, with the fields a test cares about passed in.

export const exam = (fields: Partial<Exam> = {}): Exam => ({
  id: 'exam-1',
  slug: 'gate-cse',
  name: 'GATE CSE',
  full_name: null,
  category: 'engineering',
  position: 1,
  created_at: '2026-01-01T00:00:00Z',
  ...fields,
})

export const subject = (fields: Partial<Subject> = {}): Subject => ({
  id: 'subject-1',
  exam_id: 'exam-1',
  slug: 'operating-systems',
  name: 'Operating Systems',
  position: 1,
  ...fields,
})

export const topic = (fields: Partial<Topic> = {}): Topic => ({
  id: 'topic-1',
  subject_id: 'subject-1',
  slug: 'scheduling',
  name: 'Scheduling',
  position: 1,
  ...fields,
})

export const question = (fields: Partial<Question> = {}): Question => ({
  id: 'q-1',
  code: 'Q1001',
  topic_id: 'topic-1',
  subtopic: null,
  difficulty: 'medium',
  type: 'practice',
  year: null,
  source: null,
  body: 'Which algorithm can starve a process?',
  options: ['FCFS', 'Round robin', 'SJF', 'None'],
  answer_index: 2,
  hint: null,
  explanation: 'Short jobs keep jumping ahead of long ones.',
  formula_id: null,
  tags: [],
  status: 'published',
  created_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...fields,
})

/** A question as practice and tests load it, in `topicOf`'s topic. */
export const practiceQuestion = (fields: Partial<Question> = {}, topicOf: Topic = topic()): PracticeQuestion => ({
  ...question({ topic_id: topicOf.id, ...fields }),
  exam: exam(),
  subject: subject(),
  topic: topicOf,
  formula: null,
})

export const totals = (fields: Partial<MyProgressTotals> = {}): MyProgressTotals => ({
  attempts: 0,
  unique_questions: 0,
  independent: 0,
  hint: 0,
  revealed: 0,
  incorrect: 0,
  skipped: 0,
  time_ms: 0,
  ...fields,
})
