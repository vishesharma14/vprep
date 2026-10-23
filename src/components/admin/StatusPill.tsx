import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { QUESTION_STATUS_LABEL } from '../../lib/questions'
import type { QuestionStatus } from '../../types'

type PillTone = 'ok' | 'warn' | 'bad' | 'ink'

const pillTones: Record<PillTone, string> = {
  ok: 'bg-ok/10 text-ok',
  warn: 'bg-warn/10 text-warn',
  bad: 'bg-bad/10 text-bad',
  ink: 'bg-ink/5 text-ink/70',
}

/** A status, in Tag's lettering on a pill. */
export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[0.6875rem] font-medium uppercase tracking-wider',
        pillTones[tone],
      )}
    >
      {children}
    </span>
  )
}

const tones: Record<QuestionStatus, PillTone> = {
  published: 'ok',
  in_review: 'warn',
  draft: 'ink',
}

/** A question's status: published, in review or draft. */
export function StatusPill({ status }: { status: QuestionStatus }) {
  return <Pill tone={tones[status]}>{QUESTION_STATUS_LABEL[status]}</Pill>
}
