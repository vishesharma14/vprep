import type { Question } from '../../types'
import { Tag } from '../ui/Tag'

type TaggedQuestion = Pick<Question, 'subtopic' | 'difficulty' | 'type' | 'year' | 'source'>

/** A question's subtopic, difficulty, PYQ year and source, as tags. */
export function QuestionTags({ question }: { question: TaggedQuestion }) {
  return (
    <ul aria-label="About this question" className="flex flex-wrap gap-2">
      {question.subtopic && (
        <li>
          <Tag>{question.subtopic}</Tag>
        </li>
      )}
      <li>
        <Tag tone="ink">{question.difficulty}</Tag>
      </li>
      {question.type === 'pyq' && question.year !== null && (
        <li>
          <Tag>PYQ {question.year}</Tag>
        </li>
      )}
      {question.source && (
        <li>
          <Tag tone="ink">{question.source}</Tag>
        </li>
      )}
    </ul>
  )
}
