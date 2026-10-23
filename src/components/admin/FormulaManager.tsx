import { useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useAsync } from '../../hooks/useAsync'
import { formulaDeleted, type AdminQuestion } from '../../hooks/useAdminQuestions'
import { cx } from '../../lib/cx'
import { plural } from '../../lib/format'
import {
  deleteFormula,
  formulaErrors,
  formulaFormOf,
  formulaInput,
  NEW_FORMULA,
  renameFormula,
  saveFormula,
  type FormulaForm,
} from '../../lib/formulaForm'
import { fetchFormulas, groupFormulas, type FormulaGroup } from '../../lib/formulas'
import type { Formula } from '../../types'
import { FormulaExpression } from '../practice/FormulaExpression'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { TextAreaField, TextField } from '../ui/Field'
import { LoadError } from '../ui/LoadError'
import { Notice } from '../ui/Notice'
import { LoadingLabel, Skeleton } from '../ui/Skeleton'
import { FocusNote, type NoteMessage } from './FocusNote'

const gridClass = 'grid gap-4 sm:grid-cols-2'

const editButtonId = (formulaId: string) => `admin-formula-${formulaId}-edit`

/** Focuses the element with `id` once React has rendered it. */
const focusById = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus())

/** Questions of any status linked to each formula, by formula id. */
function countUses(questions: AdminQuestion[]) {
  const uses = new Map<string, number>()
  for (const q of questions) if (q.formula_id) uses.set(q.formula_id, (uses.get(q.formula_id) ?? 0) + 1)
  return uses
}

/** Every formula by group, to add, edit and delete. `questions` gives how many use each. */
export function FormulaManager({ questions }: { questions: AdminQuestion[] }) {
  const formulas = useAsync(fetchFormulas)
  if (formulas.status === 'error') {
    return <LoadError message={`Couldn't load the formulas. ${formulas.error}`} onRetry={formulas.retry} />
  }
  if (formulas.status === 'loading') return <FormulaManagerSkeleton />
  return <FormulaBoard initial={formulas.data} questions={questions} />
}

function FormulaBoard({ initial, questions }: { initial: Formula[]; questions: AdminQuestion[] }) {
  const [formulas, setFormulas] = useState(initial)
  const [adding, setAdding] = useState(false)
  // The formula being edited, by id.
  const [editing, setEditing] = useState<string | null>(null)
  const [note, setNote] = useState<NoteMessage | null>(null)
  const addId = useId()
  const uses = useMemo(() => countUses(questions), [questions])
  const groups = groupFormulas(formulas)
  const groupNames = groups.map((g) => g.name)

  function closeAdd(saved: Formula | null) {
    setAdding(false)
    if (!saved) return focusById(addId)
    setFormulas((list) => [...list, saved])
    setNote({ tone: 'ok', text: `Added “${saved.name}” to ${saved.group_name}.` })
  }

  function closeEdit(id: string, saved: Formula | null) {
    setEditing(null)
    if (saved) setFormulas((list) => list.map((f) => (f.id === id ? saved : f)))
    // Its group may have changed, so it is found by id wherever it is now.
    focusById(editButtonId(id))
  }

  function deleted(formula: Formula) {
    setFormulas((list) => list.filter((f) => f.id !== formula.id))
    formulaDeleted(formula.id)
    setNote({ tone: 'ok', text: `Deleted “${formula.name}”.` })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink/70">
          {plural(formulas.length, 'formula')} in {plural(groups.length, 'group')}
        </p>
        {!adding && (
          <Button id={addId} size="sm" onClick={() => setAdding(true)}>
            Add formula
          </Button>
        )}
      </div>

      {adding && (
        <Card>
          <FormulaEditor formula={null} formulas={formulas} groupNames={groupNames} onClose={closeAdd} />
        </Card>
      )}

      {note && <FocusNote note={note} />}

      {formulas.length === 0 ? (
        <Card>
          <p className="text-ink/70">No formulas yet.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-10">
          {groups.map((group) => (
            <FormulaSection
              key={group.name}
              group={group}
              formulas={formulas}
              groupNames={groupNames}
              uses={uses}
              editing={editing}
              onEdit={setEditing}
              onCloseEdit={closeEdit}
              onDeleted={deleted}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface FormulaSectionProps {
  group: FormulaGroup<Formula>
  formulas: Formula[]
  groupNames: string[]
  uses: ReadonlyMap<string, number>
  editing: string | null
  onEdit: (id: string) => void
  onCloseEdit: (id: string, saved: Formula | null) => void
  onDeleted: (formula: Formula) => void
}

function FormulaSection({ group, formulas, groupNames, uses, editing, onEdit, onCloseEdit, onDeleted }: FormulaSectionProps) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="border-b border-ink/10 pb-3">
        <h2 id={headingId} className="text-xl font-bold">
          {group.name}
        </h2>
        <p className="font-mono text-xs text-ink/60">{plural(group.formulas.length, 'formula')}</p>
      </div>
      <ul className={gridClass}>
        {group.formulas.map((formula) =>
          formula.id === editing ? (
            // The form gets the whole width.
            <li key={formula.id} className="sm:col-span-2">
              <Card>
                <FormulaEditor
                  formula={formula}
                  formulas={formulas}
                  groupNames={groupNames}
                  onClose={(saved) => onCloseEdit(formula.id, saved)}
                />
              </Card>
            </li>
          ) : (
            <li key={formula.id}>
              <FormulaCard
                formula={formula}
                uses={uses.get(formula.id) ?? 0}
                onEdit={() => onEdit(formula.id)}
                onDeleted={() => onDeleted(formula)}
              />
            </li>
          ),
        )}
      </ul>
    </section>
  )
}

type CardState = { kind: 'idle' } | { kind: 'confirm' } | { kind: 'deleting' } | { kind: 'error'; message: string }

interface FormulaCardProps {
  formula: Formula
  /** Questions of any status linked to it. */
  uses: number
  onEdit: () => void
  onDeleted: () => void
}

function FormulaCard({ formula, uses, onEdit, onDeleted }: FormulaCardProps) {
  const [state, setState] = useState<CardState>({ kind: 'idle' })
  const deleteRef = useRef<HTMLDivElement>(null)
  const busy = state.kind === 'deleting'

  function cancel() {
    setState({ kind: 'idle' })
    requestAnimationFrame(() => deleteRef.current?.querySelector<HTMLElement>('[data-action="delete"]')?.focus())
  }

  async function remove() {
    setState({ kind: 'deleting' })
    const error = await deleteFormula(formula.id)
    if (error) return setState({ kind: 'error', message: error })
    onDeleted()
  }

  return (
    <Card className="flex h-full flex-col gap-3">
      <div>
        <h3 className="break-words font-bold">{formula.name}</h3>
        <p className="break-all font-mono text-xs text-ink/60">{formula.slug}</p>
      </div>
      <FormulaExpression expression={formula.expression} />
      {formula.note && <p className="text-sm text-ink/70">{formula.note}</p>}
      <div ref={deleteRef} className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        <p className="font-mono text-xs text-ink/60">Used in {plural(uses, 'question')}</p>
        <div className="flex gap-1.5">
          <Button
            id={editButtonId(formula.id)}
            variant="secondary"
            size="sm"
            disabled={busy}
            aria-label={`Edit ${formula.name}`}
            onClick={onEdit}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-action="delete"
            disabled={busy}
            aria-label={`Delete ${formula.name}`}
            onClick={() => setState({ kind: 'confirm' })}
          >
            Delete
          </Button>
        </div>
      </div>

      {state.kind === 'deleting' && (
        <p role="status" className="text-sm text-ink/60">
          Deleting…
        </p>
      )}
      {state.kind === 'confirm' && (
        <div role="group" aria-label={`Delete ${formula.name}?`} className="flex flex-col gap-2 rounded-lg bg-bad/5 p-3">
          <p className="text-sm">
            Delete “{formula.name}”?{' '}
            {uses > 0 ? `${plural(uses, 'question')} will lose the link to it.` : 'No questions use it.'} This can't
            be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" autoFocus onClick={cancel}>
              Cancel
            </Button>
            <Button size="sm" variant="danger" onClick={remove}>
              Delete formula
            </Button>
          </div>
        </div>
      )}
      {state.kind === 'error' && (
        <div className="flex flex-col items-start gap-2">
          <Notice tone="bad">{state.message}</Notice>
          <Button size="sm" variant="secondary" autoFocus onClick={cancel}>
            Dismiss
          </Button>
        </div>
      )}
    </Card>
  )
}

interface FormulaEditorProps {
  /** Null to add one. */
  formula: Formula | null
  formulas: Formula[]
  /** Groups in use, offered as suggestions. */
  groupNames: string[]
  /** With the saved formula, or null if cancelled. */
  onClose: (saved: Formula | null) => void
}

/** Adds a formula or edits one, with the formula block as learners see it. */
function FormulaEditor({ formula, formulas, groupNames, onClose }: FormulaEditorProps) {
  const [form, setForm] = useState<FormulaForm>(() => (formula ? formulaFormOf(formula) : NEW_FORMULA))
  const [showErrors, setShowErrors] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const ids = useId()
  const others = formulas.filter((f) => f.id !== formula?.id)
  const errors = showErrors ? formulaErrors(form, others) : {}
  const expression = form.expression.trim()
  // Inside a group's section when editing, so a level below it.
  const Heading = formula ? 'h3' : 'h2'

  function set<K extends keyof FormulaForm>(key: K, value: FormulaForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    setShowErrors(true)
    setFormError(null)
    if (Object.keys(formulaErrors(form, others)).length > 0) {
      requestAnimationFrame(() => formEl.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setSaving(true)
    const result = await saveFormula(formulaInput(form), formula?.id ?? null)
    if (result.error !== undefined) {
      setFormError(`Couldn't save the formula. ${result.error}`)
      setSaving(false)
      return
    }
    onClose(result.formula)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    e.preventDefault()
    onClose(null)
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      onKeyDown={onKeyDown}
      aria-labelledby={`${ids}-heading`}
      className="flex flex-col gap-4"
    >
      <Heading id={`${ids}-heading`} className="text-lg font-bold">
        {formula ? `Edit ${formula.name}` : 'New formula'}
      </Heading>
      <div className={gridClass}>
        <TextField
          label="Name"
          autoFocus
          value={form.name}
          onChange={(e) => setForm((f) => renameFormula(f, e.target.value))}
          placeholder="e.g. Profit and loss"
          autoComplete="off"
          error={errors.name}
        />
        <TextField
          label="Slug"
          value={form.slug}
          onChange={(e) => set('slug', e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          hint="Made from the name."
          error={errors.slug}
        />
        <div className="sm:col-span-2">
          <TextField
            label="Group"
            value={form.group}
            onChange={(e) => set('group', e.target.value)}
            list={`${ids}-groups`}
            autoComplete="off"
            hint="Choose one in use, or type a new one."
            error={errors.group}
          />
          <datalist id={`${ids}-groups`}>
            {groupNames.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>
      </div>
      <TextField
        label="Expression"
        value={form.expression}
        onChange={(e) => set('expression', e.target.value)}
        className="font-mono"
        autoComplete="off"
        spellCheck={false}
        hint="Type the symbols as learners should see them: × ÷ − ² √ π."
        error={errors.expression}
      />
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-bold">Preview</p>
        <FormulaExpression expression={expression || 'The formula shows here.'} className={cx(!expression && 'text-ink/50')} />
      </div>
      <TextAreaField
        label="Note"
        optional
        rows={2}
        value={form.note}
        onChange={(e) => set('note', e.target.value)}
        hint="Shown under the formula, e.g. when it applies."
      />
      {formError && <Notice tone="bad">{formError}</Notice>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : formula ? 'Save formula' : 'Add formula'}
        </Button>
        <Button variant="secondary" onClick={() => onClose(null)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export function FormulaManagerSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingLabel>Loading the formulas…</LoadingLabel>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="flex flex-col gap-4">
        <div className="border-b border-ink/10 pb-3">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-3 w-20" />
        </div>
        <ul className={gridClass}>
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i}>
              <Card className="flex flex-col gap-3">
                <Skeleton className="h-5 w-48 max-w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-8 w-32" />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
