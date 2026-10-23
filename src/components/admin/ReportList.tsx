import { useId, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { useAsync } from '../../hooks/useAsync'
import { reportClosed } from '../../hooks/useAdminQuestions'
import { adminRejected, adminWrite } from '../../lib/admin'
import { dbErrorMessage, SESSION_EXPIRED } from '../../lib/errors'
import { firstLine, formatDate } from '../../lib/format'
import { neon } from '../../lib/neon'
import { reasonLabel } from '../../lib/reports'
import { withSessionRecovery } from '../../lib/session'
import type { Profile, Question, Report, ReportStatus } from '../../types'
import { Button, ButtonLink } from '../ui/Button'
import { Card } from '../ui/Card'
import { LoadError } from '../ui/LoadError'
import { Notice } from '../ui/Notice'
import { LoadingLabel, Skeleton } from '../ui/Skeleton'
import { FocusNote, type NoteMessage } from './FocusNote'
import { Pill } from './StatusPill'

/** A report with its question and the names of who filed and closed it. */
type AdminReport = Report & {
  /** Null only if the token couldn't see the question. */
  question: Pick<Question, 'code' | 'body'> | null
  /** Null once the account is deleted. */
  reporter: Pick<Profile, 'full_name'> | null
  resolver: Pick<Profile, 'full_name'> | null
}

type ClosedStatus = Exclude<ReportStatus, 'open'>

const CLOSED_LABEL: Record<ClosedStatus, string> = { resolved: 'Resolved', dismissed: 'Dismissed' }

// reports has two links to profiles, so each embed names its foreign key.
const REPORT_COLUMNS =
  '*, question:questions(code, body), reporter:profiles!reports_user_id_fkey(full_name), resolver:profiles!reports_resolved_by_fkey(full_name)'

async function fetchReports() {
  const { data, error, status, expired } = await withSessionRecovery(
    () => neon.from('reports').select(REPORT_COLUMNS).order('created_at', { ascending: false }),
    adminRejected,
  )
  if (error) throw new Error(expired ? SESSION_EXPIRED : dbErrorMessage(error, status))
  return data as AdminReport[]
}

/** Marks a report resolved or dismissed by `adminId`, now. Resolves to the saved report, or an error message. */
async function closeReport(id: string, status: ClosedStatus, adminId: string) {
  const result = await adminWrite<AdminReport>(() =>
    neon
      .from('reports')
      .update({ status, resolved_at: new Date().toISOString(), resolved_by: adminId })
      .eq('id', id)
      .select(REPORT_COLUMNS),
  )
  if (result.error !== undefined) return { error: result.error }
  const report = result.rows[0]
  if (!report) return { error: "Couldn't find this report. It may have been deleted. Reload the page and try again." }
  return { report }
}

/** Newest first; closed ones by when they were closed. */
const byClosed = (a: AdminReport, b: AdminReport) => (b.resolved_at ?? '').localeCompare(a.resolved_at ?? '')

/** Learners' reports: the open ones to resolve or dismiss, then the closed ones. */
export function ReportList() {
  const reports = useAsync(fetchReports)
  if (reports.status === 'error') {
    return <LoadError message={`Couldn't load the reports. ${reports.error}`} onRetry={reports.retry} />
  }
  if (reports.status === 'loading') return <ReportListSkeleton />
  return <ReportBoard initial={reports.data} />
}

function ReportBoard({ initial }: { initial: AdminReport[] }) {
  const { profile } = useAuth()
  const [reports, setReports] = useState(initial)
  const [note, setNote] = useState<NoteMessage | null>(null)
  const open = reports.filter((r) => r.status === 'open')
  const closed = reports.filter((r) => r.status !== 'open').sort(byClosed)

  function onClosed(report: AdminReport) {
    setReports((list) => list.map((r) => (r.id === report.id ? report : r)))
    reportClosed(report.question_id)
    const what = report.question ? `The report on ${report.question.code}` : 'The report'
    // The report leaves the open list, taking focus with it.
    setNote({ tone: 'ok', text: `${what} is ${report.status === 'resolved' ? 'resolved' : 'dismissed'}.` })
  }

  return (
    <div className="flex flex-col gap-8">
      {note && <FocusNote note={note} />}
      <ReportSection
        title={`Open (${open.length})`}
        empty="No open reports."
        reports={open}
        adminId={profile?.id ?? null}
        onClosed={onClosed}
      />
      <ReportSection
        title={`Resolved / dismissed (${closed.length})`}
        empty="None yet."
        reports={closed}
        adminId={null}
        onClosed={onClosed}
      />
    </div>
  )
}

interface ReportSectionProps {
  title: string
  empty: string
  reports: AdminReport[]
  /** Who closes the reports; null when they can't be closed here. */
  adminId: string | null
  onClosed: (report: AdminReport) => void
}

function ReportSection({ title, empty, reports, adminId, onClosed }: ReportSectionProps) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="border-b border-ink/10 pb-3 text-xl font-bold">
        {title}
      </h2>
      {reports.length === 0 ? (
        <p className="text-ink/70">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((report) => (
            <li key={report.id}>
              <ReportCard report={report} adminId={adminId} onClosed={onClosed} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

interface ReportCardProps {
  report: AdminReport
  adminId: string | null
  onClosed: (report: AdminReport) => void
}

function ReportCard({ report, adminId, onClosed }: ReportCardProps) {
  const [saving, setSaving] = useState<ClosedStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const headingId = useId()
  const reporter = report.user_id ? (report.reporter?.full_name ?? 'A learner') : 'A deleted account'
  const code = report.question?.code ?? 'Question'

  async function close(status: ClosedStatus) {
    if (!adminId) return
    setSaving(status)
    setError(null)
    const result = await closeReport(report.id, status, adminId)
    setSaving(null)
    if (result.error !== undefined) return setError(`Couldn't save. ${result.error}`)
    onClosed(result.report)
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <h3 id={headingId} className="font-bold">
          {reasonLabel(report.reason)}
        </h3>
        {report.status !== 'open' && (
          <Pill tone={report.status === 'resolved' ? 'ok' : 'ink'}>{CLOSED_LABEL[report.status]}</Pill>
        )}
      </div>
      {report.note && (
        <blockquote className="whitespace-pre-line break-words border-l-2 border-ink/15 pl-3 text-ink/80">
          {report.note}
        </blockquote>
      )}
      <div className="flex flex-col gap-0.5 text-sm text-ink/60">
        <p>
          {reporter} · <time dateTime={report.created_at}>{formatDate(report.created_at)}</time>
        </p>
        {report.status !== 'open' && report.resolved_at && (
          <p>
            {CLOSED_LABEL[report.status]} by {report.resolver?.full_name ?? 'an admin'} ·{' '}
            <time dateTime={report.resolved_at}>{formatDate(report.resolved_at)}</time>
          </p>
        )}
      </div>
      <p className="line-clamp-2 break-words rounded-lg bg-ink/5 px-3 py-2 text-sm">
        <span className="font-mono font-medium">{code}</span>
        {report.question && <span className="text-ink/80"> · {firstLine(report.question.body)}</span>}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink
          to={{ search: `?tab=edit&id=${report.question_id}` }}
          variant="secondary"
          size="sm"
          aria-label={`Open ${code} in the editor`}
        >
          Open in editor
        </ButtonLink>
        {report.status === 'open' && adminId && (
          <>
            <Button size="sm" disabled={saving !== null} aria-describedby={headingId} onClick={() => close('resolved')}>
              {saving === 'resolved' ? 'Resolving…' : 'Resolve'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={saving !== null}
              aria-describedby={headingId}
              onClick={() => close('dismissed')}
            >
              {saving === 'dismissed' ? 'Dismissing…' : 'Dismiss'}
            </Button>
          </>
        )}
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
    </Card>
  )
}

export function ReportListSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <LoadingLabel>Loading the reports…</LoadingLabel>
      {[3, 2].map((count, i) => (
        <div key={i} className="flex flex-col gap-4">
          <Skeleton className="h-7 w-48" />
          {Array.from({ length: count }, (_, j) => (
            <Card key={j} className="flex flex-col gap-3">
              <Skeleton className="h-5 w-56 max-w-full" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-9 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-8 w-20" />
              </div>
            </Card>
          ))}
        </div>
      ))}
    </div>
  )
}
