import type { ReactNode } from 'react'
import type { Difficulty } from '../../types'
import { Card } from '../ui/Card'
import { Tag } from '../ui/Tag'

interface QuestionCardProps {
  code: string
  exam: string
  topic: string
  difficulty: Difficulty
  /** Set for previous year questions, shown as "PYQ <year>". */
  pyqYear?: number | null
  /** The start of the question, usually firstLine(body). Clamped to two lines. */
  preview: ReactNode
  /** Details and actions under the question. */
  children: ReactNode
}

/** A question in a list: its code, where it comes from, and how it starts. */
export function QuestionCard({ code, exam, topic, difficulty, pyqYear, preview, children }: QuestionCardProps) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-mono text-xs text-ink/60">{code}</span>
        <ul aria-label="About this question" className="flex flex-wrap gap-1.5">
          <li>
            <Tag>{exam}</Tag>
          </li>
          <li>
            <Tag tone="ink">{topic}</Tag>
          </li>
          <li>
            <Tag tone="ink">{difficulty}</Tag>
          </li>
          {pyqYear != null && (
            <li>
              <Tag>PYQ {pyqYear}</Tag>
            </li>
          )}
        </ul>
      </div>
      <p className="line-clamp-2 break-words">{preview}</p>
      {children}
    </Card>
  )
}
