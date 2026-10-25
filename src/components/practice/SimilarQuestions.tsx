import { useId } from 'react'
import { useSimilarQuestions } from '../../hooks/useSimilarQuestions'
import { firstLine } from '../../lib/format'
import { ButtonLink } from '../ui/Button'
import { Card } from '../ui/Card'
import { Tag } from '../ui/Tag'

/**
 * Questions like this one, loaded in the background once it is answered.
 * Shows nothing while they load, if they fail to, or if there are none.
 */
export function SimilarQuestions({ questionId }: { questionId: string }) {
  const similar = useSimilarQuestions(questionId)
  const headingId = useId()
  if (similar.status !== 'ready' || similar.data.length === 0) return null
  const rows = similar.data

  return (
    <section aria-labelledby={headingId}>
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={headingId} className="text-lg font-bold">
            Similar questions
          </h2>
          <ButtonLink to={`/practice?ids=${rows.map((row) => row.id).join(',')}`} size="sm">
            {rows.length === 1 ? 'Practise this question' : 'Practise these'}
          </ButtonLink>
        </div>
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-1.5 border-t border-ink/10 pt-3 first:border-t-0 first:pt-0">
              <p className="line-clamp-2 break-words">{firstLine(row.body)}</p>
              <ul aria-label="About this question" className="flex flex-wrap gap-1.5">
                <li>
                  <Tag tone="ink">{row.topic_name}</Tag>
                </li>
                <li>
                  <Tag tone="ink">{row.difficulty}</Tag>
                </li>
              </ul>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  )
}
