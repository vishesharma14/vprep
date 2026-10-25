import { useId } from 'react'
import type { AsyncResult } from '../../hooks/useAsync'
import { cx } from '../../lib/cx'
import { firstLine } from '../../lib/format'
import { DUPLICATE_PERCENT, EMBED_COMMAND, isPossibleDuplicate, similarityPercent } from '../../lib/similar'
import type { AdminSimilarQuestionRow } from '../../types'
import { ButtonLink } from '../ui/Button'
import { Card } from '../ui/Card'
import { LoadError } from '../ui/LoadError'
import { LoadingLabel, Skeleton } from '../ui/Skeleton'
import { Pill, StatusPill } from './StatusPill'

interface SimilarQuestionsPanelProps {
  similar: AsyncResult<AdminSimilarQuestionRow[]>
  /** The Questions list to return to from the editor, passed on to the questions opened from here. */
  listSearch: string
}

/** The questions nearest to the one being edited, by embedding, to catch duplicates. */
export function SimilarQuestionsPanel({ similar, listSearch }: SimilarQuestionsPanelProps) {
  const headingId = useId()

  return (
    <section aria-labelledby={headingId}>
      <Card className="flex flex-col gap-4">
        <div>
          <h3 id={headingId} className="text-lg font-bold">
            Similar questions
          </h3>
          <p className="text-sm text-ink/60">
            The nearest by meaning, in any exam and status, as the question read when it was last embedded.{' '}
            {DUPLICATE_PERCENT}% or more is marked as a possible duplicate.
          </p>
        </div>

        {similar.status === 'loading' ? (
          <div className="flex flex-col gap-3">
            <LoadingLabel>Loading similar questions…</LoadingLabel>
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : similar.status === 'error' ? (
          <LoadError message={`Couldn't load similar questions. ${similar.error}`} onRetry={similar.retry} />
        ) : similar.data.length === 0 ? (
          <p className="text-sm text-ink/70">
            Nothing to compare yet: this question has no embedding. Run{' '}
            <code className="font-mono text-ink">{EMBED_COMMAND}</code>, then reload.
          </p>
        ) : (
          <ul className="flex flex-col">
            {similar.data.map((row) => (
              <SimilarRow key={row.id} row={row} listSearch={listSearch} />
            ))}
          </ul>
        )}
      </Card>
    </section>
  )
}

function SimilarRow({ row, listSearch }: { row: AdminSimilarQuestionRow; listSearch: string }) {
  const duplicate = isPossibleDuplicate(row.similarity)
  return (
    <li
      className={cx(
        'flex items-start gap-3 border-t border-ink/10 py-3 first:border-t-0 first:pt-0 last:pb-0',
        duplicate && 'rounded-lg border-t-0 bg-bad/5 px-3 first:pt-3 last:pb-3',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-mono text-sm font-medium">{row.code}</span>
          <StatusPill status={row.status} />
          {duplicate && <Pill tone="bad">Possible duplicate</Pill>}
          <span className="font-mono text-sm tabular-nums text-ink/70">
            {similarityPercent(row.similarity)}% similar
          </span>
        </div>
        <p className="line-clamp-2 break-words text-sm">{firstLine(row.body)}</p>
        <p className="text-xs text-ink/60">
          {row.exam_name} · {row.topic_name}
        </p>
      </div>
      <ButtonLink
        to={{ search: `?tab=edit&id=${row.id}` }}
        state={{ list: listSearch }}
        variant="secondary"
        size="sm"
        aria-label={`Edit ${row.code}`}
        className="shrink-0"
      >
        Edit
      </ButtonLink>
    </li>
  )
}
