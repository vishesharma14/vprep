import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cx } from '../../lib/cx'

// Without a height, so the textarea can set its own.
const controlBase = cx(
  'w-full rounded-lg border border-ink/15 bg-sheet px-3 text-base text-ink transition-colors',
  'hover:border-ink/30 focus-visible:border-pen',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen',
  'aria-invalid:border-bad disabled:opacity-50',
)

const controlClass = cx(controlBase, 'h-11')

interface FieldProps {
  label: string
  /** Help text under the control; replaced by `error` when there is one. */
  hint?: string
  error?: string
  optional?: boolean
}

function FieldShell({ id, label, hint, error, optional, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
        {optional && <span className="font-normal text-ink/60"> (optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-bad">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-sm text-ink/60">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

const describedBy = (id: string, { hint, error }: FieldProps) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined

type TextFieldProps = FieldProps & InputHTMLAttributes<HTMLInputElement>

/** Labelled text input with hint and error wired up for screen readers. */
export function TextField({ label, hint, error, optional, id, className, ...props }: TextFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} optional={optional}>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, { label, hint, error })}
        className={cx(controlClass, 'read-only:bg-ink/5 read-only:text-ink/70', className)}
        {...props}
      />
    </FieldShell>
  )
}

/** An input styled like TextField's, for when it is labelled another way (aria-label, a fieldset). */
export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(controlClass, className)} {...props} />
}

type SelectFieldProps = FieldProps & SelectHTMLAttributes<HTMLSelectElement>

/** Labelled native select, styled to match TextField. */
export function SelectField({ label, hint, error, optional, id, className, children, ...props }: SelectFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} optional={optional}>
      <select
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, { label, hint, error })}
        className={cx(controlClass, className)}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  )
}

type TextAreaFieldProps = FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>

/** Labelled multi-line text input, styled to match TextField. */
export function TextAreaField({ label, hint, error, optional, id, className, ...props }: TextAreaFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} optional={optional}>
      <textarea
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, { label, hint, error })}
        className={cx(controlBase, 'min-h-24 resize-y py-2', className)}
        {...props}
      />
    </FieldShell>
  )
}
