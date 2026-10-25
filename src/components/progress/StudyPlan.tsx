import { masteryPercent, planHref, planReason } from '../../lib/studyPlan'
import type { StudyPlanRow } from '../../types'
import { ButtonLink } from '../ui/Button'
import { ProgressBar } from '../ui/ProgressBar'
import { LoadingLabel, Skeleton } from '../ui/Skeleton'

/**
 * Topics from recommend_topics(), most urgent first, each with why it was
 * picked and a Practise button. `showMastery` adds a mastery bar to each.
 */
export function StudyPlanList({ rows, showMastery = false }: { rows: StudyPlanRow[]; showMastery?: boolean }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-ink/70">Answer a few questions and VPrep will suggest what to study next.</p>
        <ButtonLink to="/exams" variant="secondary" size="sm">
          Browse exams
        </ButtonLink>
      </div>
    )
  }

  return (
    <ol aria-label="Topics to study" className="flex flex-col divide-y divide-ink/10">
      {rows.map((row) => (
        <li key={row.topic_id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1">
            <p className="break-words font-bold">{row.topic_name}</p>
            <p className="break-words text-xs text-ink/60">
              {row.exam_name} · {row.subject_name}
            </p>
            <p className="mt-1 font-mono text-xs text-ink/70">{planReason(row)}</p>
            {showMastery && <MasteryBar mastery={row.mastery} />}
          </div>
          <ButtonLink
            to={planHref(row)}
            variant="secondary"
            size="sm"
            aria-label={`Practise: ${row.topic_name}`}
            className="shrink-0"
          >
            Practise
          </ButtonLink>
        </li>
      ))}
    </ol>
  )
}

/** Null for a topic not answered yet. */
function MasteryBar({ mastery }: { mastery: number | null }) {
  const percent = mastery === null ? null : masteryPercent(mastery)
  return (
    <div className="mt-2 flex items-center gap-3">
      <ProgressBar value={percent ?? 0} max={100} className="w-24 shrink-0 sm:w-40" />
      <span className="font-mono text-xs text-ink/70">
        {percent === null ? 'No answers yet' : `${percent}% mastery`}
      </span>
    </div>
  )
}

export function StudyPlanSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col divide-y divide-ink/10">
      <LoadingLabel>Loading your study plan…</LoadingLabel>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <div className="flex min-w-0 flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-48 max-w-full" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0" />
        </div>
      ))}
    </div>
  )
}
