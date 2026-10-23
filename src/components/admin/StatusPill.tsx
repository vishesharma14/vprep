import { cx } from '../../lib/cx'
import { QUESTION_STATUS_LABEL } from '../../lib/questions'
import type { QuestionStatus } from '../../types'

const tones: Record<QuestionStatus, string> = {
  published: 'bg-ok/10 text-ok',
  in_review: 'bg-warn/10 text-warn',
  draft: 'bg-ink/5 text-ink/70',
}

/** A question's status (published, in review or draft), in Tag's lettering on a pill. */
export function StatusPill({ status }: { status: QuestionStatus }) {
  return (
    <span
      className={cx(
        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[0.6875rem] font-medium uppercase tracking-wider',
        tones[status],
      )}
    >
      {QUESTION_STATUS_LABEL[status]}
    </span>
  )
}
