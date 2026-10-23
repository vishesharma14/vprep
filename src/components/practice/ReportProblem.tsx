import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { REPORT_NOTE_MAX, REPORT_REASONS, sendReport } from '../../lib/reports'
import type { ReportReason } from '../../types'
import { Button } from '../ui/Button'
import { SelectField, TextAreaField } from '../ui/Field'
import { FlagIcon } from '../ui/Icon'
import { Notice } from '../ui/Notice'
import { SignInIconLink } from './SignInIconLink'

interface ReportButtonProps {
  signedIn: boolean
  open: boolean
  /** The id of the ReportForm it opens. */
  formId: string
  onToggle: () => void
}

/** Opens and closes the "Report a problem" form. Carries data-report-button, for returning focus. */
export function ReportButton({ signedIn, open, formId, onToggle }: ReportButtonProps) {
  if (!signedIn) {
    return (
      <SignInIconLink label="Sign in to report a problem">
        <FlagIcon />
      </SignInIconLink>
    )
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      data-report-button
      aria-label="Report a problem"
      title="Report a problem"
      aria-expanded={open}
      aria-controls={open ? formId : undefined}
      onClick={onToggle}
      className="aria-expanded:bg-pen/10"
    >
      <FlagIcon />
    </Button>
  )
}

interface ReportFormProps {
  id: string
  questionId: string
  code: string
  onClose: () => void
}

/**
 * Tells the content team what is wrong with a question. Mount it when opened.
 * Carries data-report-panel, so the question's keyboard shortcuts leave it alone.
 */
export function ReportForm({ id, questionId, code, onClose }: ReportFormProps) {
  const [reason, setReason] = useState<ReportReason | ''>('')
  const [note, setNote] = useState('')
  const [reasonError, setReasonError] = useState<string>()
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const thanksRef = useRef<HTMLDivElement>(null)
  const headingId = useId()

  useEffect(() => {
    if (sent) thanksRef.current?.focus()
  }, [sent])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (sending) return
    if (!reason) {
      setReasonError('Choose what is wrong.')
      formRef.current?.querySelector('select')?.focus()
      return
    }
    setSending(true)
    setError(null)
    const failed = await sendReport({ question_id: questionId, reason, note: note.trim() || null })
    setSending(false)
    if (failed) setError(failed)
    else setSent(true)
  }

  if (sent) {
    return (
      <div
        id={id}
        ref={thanksRef}
        tabIndex={-1}
        data-report-panel
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ok/10 px-4 py-2 text-ok outline-none"
      >
        <p className="text-sm">Thanks. The content team will review it.</p>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    )
  }

  return (
    <form
      ref={formRef}
      id={id}
      data-report-panel
      aria-labelledby={headingId}
      noValidate
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        onClose()
      }}
      className="flex flex-col gap-4 rounded-lg border border-ink/10 p-4"
    >
      <p id={headingId} className="font-bold">
        Report a problem with {code}
      </p>
      <SelectField
        label="What's wrong?"
        value={reason}
        autoFocus
        error={reasonError}
        onChange={(e) => {
          setReason(e.target.value as ReportReason)
          setReasonError(undefined)
        }}
      >
        <option value="" disabled>
          Choose a reason
        </option>
        {REPORT_REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </SelectField>
      <TextAreaField
        label="Details"
        optional
        rows={3}
        maxLength={REPORT_NOTE_MAX}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        hint={`${note.length} / ${REPORT_NOTE_MAX} characters`}
      />
      {error && <Notice tone="bad">Couldn't send the report. {error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={sending}>
          {sending ? 'Sending…' : 'Send'}
        </Button>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
