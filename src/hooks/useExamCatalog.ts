import { contentRevision } from '../lib/content'
import { dbErrorMessage } from '../lib/errors'
import { neon } from '../lib/neon'
import type { Exam, Subject, Topic, TopicCatalogRow } from '../types'
import { useAsync } from './useAsync'

/** A topic with its published-question counts from topic_catalog. */
export type CatalogTopic = Topic & TopicCounts

export interface CatalogSubject extends Subject {
  topics: CatalogTopic[]
  question_count: number
}

export interface CatalogExam extends Exam {
  subjects: CatalogSubject[]
  topic_count: number
  question_count: number
}

type ExamTree = Exam & { subjects: Array<Subject & { topics: Topic[] }> }

type TopicCounts = Omit<TopicCatalogRow, 'topic_id' | 'subject_id'>

const EMPTY_COUNTS: TopicCounts = {
  question_count: 0,
  easy_count: 0,
  medium_count: 0,
  hard_count: 0,
  pyq_count: 0,
  subtopics: [],
}

const countsOf = (row: TopicCatalogRow): TopicCounts => ({
  question_count: row.question_count,
  easy_count: row.easy_count,
  medium_count: row.medium_count,
  hard_count: row.hard_count,
  pyq_count: row.pyq_count,
  subtopics: row.subtopics,
})

const sum = <T>(items: T[], count: (item: T) => number) =>
  items.reduce((total, item) => total + count(item), 0)

async function fetchCatalog(): Promise<CatalogExam[]> {
  const [tree, counts] = await Promise.all([
    // One request for the whole tree; name breaks ties in position.
    neon
      .from('exams')
      .select('*, subjects(*, topics(*))')
      .order('position')
      .order('name')
      .order('position', { referencedTable: 'subjects' })
      .order('name', { referencedTable: 'subjects' })
      .order('position', { referencedTable: 'subjects.topics' })
      .order('name', { referencedTable: 'subjects.topics' }),
    neon.from('topic_catalog').select('*'),
  ])
  if (tree.error) throw new Error(dbErrorMessage(tree.error, tree.status))
  if (counts.error) throw new Error(dbErrorMessage(counts.error, counts.status))

  const countsByTopic = new Map((counts.data as TopicCatalogRow[]).map((row) => [row.topic_id, countsOf(row)]))

  return (tree.data as ExamTree[]).map((exam) => {
    const subjects = exam.subjects.map((subject) => {
      const topics = subject.topics.map((topic) => ({
        ...topic,
        ...(countsByTopic.get(topic.id) ?? EMPTY_COUNTS),
      }))
      return { ...subject, topics, question_count: sum(topics, (t) => t.question_count) }
    })
    return {
      ...exam,
      subjects,
      topic_count: sum(subjects, (s) => s.topics.length),
      question_count: sum(subjects, (s) => s.question_count),
    }
  })
}

// The catalog rarely changes, so it is fetched once and shared by every page
// that needs it, until an admin changes the content (contentRevision). After
// an error, retry() fetches again.
let cached: { revision: number; exams: CatalogExam[] } | undefined
let pending: { revision: number; promise: Promise<CatalogExam[]> } | undefined

/** The catalog, fetched once per content revision (outside React). */
export function loadCatalog() {
  const revision = contentRevision()
  if (pending?.revision !== revision) {
    const promise: Promise<CatalogExam[]> = fetchCatalog().then(
      (exams) => {
        if (revision === contentRevision()) cached = { revision, exams }
        return exams
      },
      (err: unknown) => {
        if (pending?.promise === promise) pending = undefined
        throw err
      },
    )
    pending = { revision, promise }
  }
  return pending.promise
}

/** Exams (by position) with their subjects, topics and question totals. */
export function useExamCatalog() {
  return useAsync(loadCatalog, cached?.revision === contentRevision() ? cached.exams : undefined)
}

/** Every topic of an exam, in order. */
export function examTopics(exam: CatalogExam) {
  return exam.subjects.flatMap((s) => s.topics)
}

export interface TopicPlace {
  exam: CatalogExam
  subject: CatalogSubject
  topic: CatalogTopic
}

/** Every topic in the catalog by id, with its exam and subject. */
export function topicPlaces(exams: CatalogExam[]): ReadonlyMap<string, TopicPlace> {
  return new Map(
    exams.flatMap((exam) =>
      exam.subjects.flatMap((subject) => subject.topics.map((topic) => [topic.id, { exam, subject, topic }] as const)),
    ),
  )
}

/** The exam and topic for a topic id, if it is in the catalog. */
export function findTopic(exams: CatalogExam[], topicId: string) {
  for (const exam of exams) {
    for (const subject of exam.subjects) {
      const topic = subject.topics.find((t) => t.id === topicId)
      if (topic) return { exam, subject, topic }
    }
  }
}
