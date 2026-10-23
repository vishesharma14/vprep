import { useId, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { addExam, addItem, deleteItem, moveItem, renameItem, updateExam } from '../../hooks/useAdminCatalog'
import type { AdminQuestion } from '../../hooks/useAdminQuestions'
import { examTopics, type CatalogExam, type CatalogSubject } from '../../hooks/useExamCatalog'
import { CATEGORIES, categoryLabel } from '../../lib/categories'
import { cx } from '../../lib/cx'
import { plural } from '../../lib/format'
import { slugify } from '../../lib/slug'
import {
  examErrors,
  examInput,
  NAME_MAX,
  nameError,
  NEW_EXAM,
  nextPosition,
  renameExam,
  type ExamForm,
  type Level,
  type Positioned,
} from '../../lib/taxonomy'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { SelectField, TextField, TextInput } from '../ui/Field'
import { ChevronIcon } from '../ui/Icon'
import { Notice } from '../ui/Notice'
import { LoadingLabel, Skeleton } from '../ui/Skeleton'
import { Tag } from '../ui/Tag'
import { FocusNote, type NoteMessage } from './FocusNote'

/** Questions in a topic (or in all the topics of a subject or exam). */
interface Counts {
  published: number
  /** Of any status. Only a topic with none can be deleted. */
  total: number
}

const NONE: Counts = { published: 0, total: 0 }

type CountsByTopic = ReadonlyMap<string, Counts>

function countByTopic(questions: AdminQuestion[]): CountsByTopic {
  const counts = new Map<string, Counts>()
  for (const q of questions) {
    const { published, total } = counts.get(q.topic_id) ?? NONE
    counts.set(q.topic_id, { published: published + (q.status === 'published' ? 1 : 0), total: total + 1 })
  }
  return counts
}

const addUp = (topicIds: string[], counts: CountsByTopic) =>
  topicIds.reduce((sum, id) => {
    const { published, total } = counts.get(id) ?? NONE
    return { published: sum.published + published, total: sum.total + total }
  }, NONE)

/** "12 published", "12 published · 3 unpublished", "No questions". */
function questionSummary({ published, total }: Counts) {
  if (total === 0) return 'No questions'
  const unpublished = total - published
  return unpublished > 0 ? `${published} published · ${unpublished} unpublished` : `${published} published`
}

const metaClass = 'font-mono text-xs text-ink/60'

/** The id of an exam's open/close button, to move focus to it. Slugs are unique and don't change. */
const examToggleId = (slug: string) => `admin-exam-${slug}`

/** Focuses the element with `id` once React has rendered it. */
const focusById = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus())

/** Moves focus to the first field marked invalid, once React has rendered the errors. */
function focusFirstInvalid(form: HTMLFormElement) {
  requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
}

/** Escape inside a form closes it. */
const closeOnEscape = (close: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

interface TaxonomyTreeProps {
  exams: CatalogExam[]
  questions: AdminQuestion[]
}

/** Exams > subjects > topics: add, rename, reorder and delete them. */
export function TaxonomyTree({ exams, questions }: TaxonomyTreeProps) {
  const counts = useMemo(() => countByTopic(questions), [questions])
  // Open exams, by slug.
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const [adding, setAdding] = useState(false)
  const [deleted, setDeleted] = useState<NoteMessage | null>(null)
  const addId = useId()

  const subjectCount = exams.reduce((n, e) => n + e.subjects.length, 0)
  const topicCount = exams.reduce((n, e) => n + e.topic_count, 0)
  const allOpen = exams.length > 0 && exams.every((e) => open.has(e.slug))

  function toggle(slug: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(slug)) next.add(slug)
      return next
    })
  }

  function closeAdd(slug: string | null) {
    setAdding(false)
    if (slug) {
      // The new exam opens, ready for its subjects.
      setOpen((prev) => new Set(prev).add(slug))
      focusById(examToggleId(slug))
    } else {
      focusById(addId)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink/70">
          {plural(exams.length, 'exam')} · {plural(subjectCount, 'subject')} · {plural(topicCount, 'topic')}
        </p>
        <div className="flex flex-wrap gap-2">
          {exams.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOpen(allOpen ? new Set() : new Set(exams.map((e) => e.slug)))}
            >
              {allOpen ? 'Close all' : 'Open all'}
            </Button>
          )}
          {!adding && (
            <Button id={addId} size="sm" onClick={() => setAdding(true)}>
              Add exam
            </Button>
          )}
        </div>
      </div>

      {adding && (
        <Card>
          <ExamEditor exam={null} exams={exams} onClose={closeAdd} />
        </Card>
      )}

      {deleted && <FocusNote note={deleted} />}

      {exams.length === 0 ? (
        <Card>
          <p className="text-ink/70">No exams yet. Add one to start.</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {exams.map((exam, i) => (
            <ExamItem
              key={exam.id}
              exam={exam}
              index={i}
              exams={exams}
              counts={counts}
              open={open.has(exam.slug)}
              onToggle={() => toggle(exam.slug)}
              onDeleted={() => setDeleted(deletedNote(exam.name))}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

/** Shown where a deleted item was, taking the focus it had. */
const deletedNote = (name: string): NoteMessage => ({ tone: 'ok', text: `Deleted “${name}”.` })

interface ExamItemProps {
  exam: CatalogExam
  index: number
  exams: CatalogExam[]
  counts: CountsByTopic
  open: boolean
  onToggle: () => void
  onDeleted: () => void
}

function ExamItem({ exam, index, exams, counts, open, onToggle, onDeleted }: ExamItemProps) {
  const panelId = useId()
  const totals = addUp(examTopics(exam).map((t) => t.id), counts)
  const subjects = exam.subjects.length

  return (
    <li>
      <Card className="px-0 py-0">
        <ItemRow
          className="p-4 sm:px-5"
          level="exam"
          name={exam.name}
          siblings={exams}
          index={index}
          questions={totals.total}
          contents={subjects > 0 ? `its ${plural(subjects, 'subject')} and ${plural(exam.topic_count, 'topic')}` : null}
          editLabel="Edit"
          renderEditor={(close) => <ExamEditor exam={exam} exams={exams} onClose={close} />}
          onDeleted={onDeleted}
        >
          <h2 className="text-lg font-bold">
            <button
              id={examToggleId(exam.slug)}
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={onToggle}
              className={cx(
                'flex max-w-full items-start gap-2 rounded text-left transition-colors hover:text-pen',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen',
              )}
            >
              <ChevronIcon className={cx('mt-1 size-4 text-ink/50 transition-transform', open && 'rotate-90')} />
              <span className="min-w-0 break-words">{exam.name}</span>
            </button>
          </h2>
          <div className="mt-1 flex flex-col gap-1.5 pl-6">
            {exam.full_name && <p className="break-words text-sm text-ink/70">{exam.full_name}</p>}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Tag>{categoryLabel(exam.category)}</Tag>
              <p className={metaClass}>
                {plural(subjects, 'subject')} · {plural(exam.topic_count, 'topic')} · {questionSummary(totals)}
              </p>
            </div>
          </div>
        </ItemRow>
        <div id={panelId} hidden={!open} className="border-t border-ink/10 px-4 pb-4 sm:px-5">
          {open && <SubjectList exam={exam} counts={counts} />}
        </div>
      </Card>
    </li>
  )
}

function SubjectList({ exam, counts }: { exam: CatalogExam; counts: CountsByTopic }) {
  const [deleted, setDeleted] = useState<NoteMessage | null>(null)
  return (
    <div className="flex flex-col">
      {exam.subjects.length === 0 ? (
        <p className="pt-4 text-sm text-ink/70">No subjects yet.</p>
      ) : (
        <ul>
          {exam.subjects.map((subject, i) => (
            <SubjectItem
              key={subject.id}
              subject={subject}
              index={i}
              subjects={exam.subjects}
              counts={counts}
              onDeleted={() => setDeleted(deletedNote(subject.name))}
            />
          ))}
        </ul>
      )}
      {deleted && (
        <div className="pt-4">
          <FocusNote note={deleted} />
        </div>
      )}
      <div className="pt-4">
        <AddItem level="subject" parentId={exam.id} parentName={exam.name} siblings={exam.subjects} />
      </div>
    </div>
  )
}

interface SubjectItemProps {
  subject: CatalogSubject
  index: number
  subjects: CatalogSubject[]
  counts: CountsByTopic
  onDeleted: () => void
}

function SubjectItem({ subject, index, subjects, counts, onDeleted }: SubjectItemProps) {
  const [deleted, setDeleted] = useState<NoteMessage | null>(null)
  const topics = subject.topics.length
  const totals = addUp(subject.topics.map((t) => t.id), counts)

  return (
    <li className="flex flex-col gap-3 border-b border-ink/10 py-4">
      <ItemRow
        level="subject"
        name={subject.name}
        siblings={subjects}
        index={index}
        questions={totals.total}
        contents={topics > 0 ? `its ${plural(topics, 'topic')}` : null}
        editLabel="Rename"
        renderEditor={(close) => <RenameForm level="subject" id={subject.id} name={subject.name} onClose={close} />}
        onDeleted={onDeleted}
      >
        <h3 className="break-words font-bold">{subject.name}</h3>
        <p className={metaClass}>
          {plural(topics, 'topic')} · {questionSummary(totals)}
        </p>
      </ItemRow>

      <div className="flex flex-col border-l-2 border-ink/10 pl-3 sm:ml-1 sm:pl-4">
        {topics === 0 ? (
          <p className="py-1 text-sm text-ink/70">No topics yet.</p>
        ) : (
          <ul className="flex flex-col">
            {subject.topics.map((topic, i) => {
              const own = counts.get(topic.id) ?? NONE
              return (
                <li key={topic.id} className="py-2">
                  <ItemRow
                    level="topic"
                    name={topic.name}
                    siblings={subject.topics}
                    index={i}
                    questions={own.total}
                    contents={null}
                    editLabel="Rename"
                    renderEditor={(close) => (
                      <RenameForm level="topic" id={topic.id} name={topic.name} onClose={close} />
                    )}
                    onDeleted={() => setDeleted(deletedNote(topic.name))}
                  >
                    <p className="break-words">{topic.name}</p>
                    <p className={metaClass}>{questionSummary(own)}</p>
                  </ItemRow>
                </li>
              )
            })}
          </ul>
        )}
        {deleted && (
          <div className="py-2">
            <FocusNote note={deleted} />
          </div>
        )}
        <div className="pt-2">
          <AddItem level="topic" parentId={subject.id} parentName={subject.name} siblings={subject.topics} />
        </div>
      </div>
    </li>
  )
}

type Action = 'edit' | 'up' | 'down' | 'delete'

type RowState =
  | { kind: 'idle' }
  | { kind: 'editing' }
  | { kind: 'busy'; label: string }
  | { kind: 'confirm' }
  /** Delete was pressed while it still has questions. */
  | { kind: 'blocked' }
  | { kind: 'error'; message: string }

interface ItemRowProps {
  level: Level
  name: string
  /** The item and the others at its level, in the order shown. */
  siblings: Positioned[]
  index: number
  /** Questions of any status inside it. It can only be deleted with none. */
  questions: number
  /** What else deleting it deletes, e.g. "its 4 topics"; null for nothing. */
  contents: string | null
  editLabel: 'Edit' | 'Rename'
  /** The form shown in place of the name while editing; it calls `close` when done. */
  renderEditor: (close: () => void) => ReactNode
  onDeleted: () => void
  className?: string
  /** The name, and what it holds. */
  children: ReactNode
}

/** An exam, subject or topic with its Edit, move up, move down and Delete buttons. */
function ItemRow({
  level,
  name,
  siblings,
  index,
  questions,
  contents,
  editLabel,
  renderEditor,
  onDeleted,
  className,
  children,
}: ItemRowProps) {
  const [row, setRow] = useState<RowState>({ kind: 'idle' })
  const rowId = useId()
  const buttonId = (action: Action) => `${rowId}-${action}`
  const blockedId = `${rowId}-blocked`
  const id = siblings[index].id
  const busy = row.kind === 'busy'
  const blocked = questions > 0
  const blockedText = `Has ${plural(questions, 'question')}. Move or delete them first.`

  /** Focuses one of the row's buttons once React has rendered it; a move that can't go further focuses the other way. */
  function focus(action: Action) {
    requestAnimationFrame(() => {
      const button = (a: Action) => document.getElementById(buttonId(a)) as HTMLButtonElement | null
      const wanted = button(action)
      const other = action === 'up' ? button('down') : action === 'down' ? button('up') : null
      const target = wanted && !wanted.disabled ? wanted : other
      target?.focus()
    })
  }

  function idle(action: Action) {
    setRow({ kind: 'idle' })
    focus(action)
  }

  async function move(step: -1 | 1) {
    setRow({ kind: 'busy', label: 'Moving…' })
    const error = await moveItem(level, siblings, index, step)
    if (error) return setRow({ kind: 'error', message: error })
    idle(step < 0 ? 'up' : 'down')
  }

  async function remove() {
    setRow({ kind: 'busy', label: 'Deleting…' })
    const error = await deleteItem(level, id)
    if (error) return setRow({ kind: 'error', message: error })
    // The row is gone; the list says so where it was.
    onDeleted()
  }

  if (row.kind === 'editing') {
    return <div className={className}>{renderEditor(() => idle('edit'))}</div>
  }

  return (
    <div className={cx('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">{children}</div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            id={buttonId('edit')}
            disabled={busy}
            aria-label={`${editLabel} ${name}`}
            onClick={() => setRow({ kind: 'editing' })}
          >
            {editLabel}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            id={buttonId('up')}
            disabled={busy || index === 0}
            aria-label={`Move ${name} up`}
            title="Move up"
            onClick={() => move(-1)}
          >
            <ChevronIcon className="-rotate-90" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            id={buttonId('down')}
            disabled={busy || index === siblings.length - 1}
            aria-label={`Move ${name} down`}
            title="Move down"
            onClick={() => move(1)}
          >
            <ChevronIcon className="rotate-90" />
          </Button>
          {/* While it has questions it only looks disabled: pressing it says why. */}
          <Button
            variant="ghost"
            size="sm"
            id={buttonId('delete')}
            disabled={busy}
            aria-disabled={blocked || undefined}
            aria-describedby={blocked ? blockedId : undefined}
            aria-label={`Delete ${name}`}
            title={blocked ? blockedText : undefined}
            className={cx(blocked && 'opacity-50')}
            onClick={() => setRow(blocked ? { kind: row.kind === 'blocked' ? 'idle' : 'blocked' } : { kind: 'confirm' })}
          >
            Delete
          </Button>
          {blocked && (
            <span id={blockedId} hidden>
              {blockedText}
            </span>
          )}
        </div>
      </div>

      {row.kind === 'busy' && (
        <p role="status" className="text-sm text-ink/60">
          {row.label}
        </p>
      )}
      {row.kind === 'blocked' && (
        <p role="status" className="text-sm text-ink/70">
          {blockedText}
        </p>
      )}
      {row.kind === 'confirm' && (
        <div role="group" aria-label={`Delete ${name}?`} className="flex flex-col gap-2 rounded-lg bg-bad/5 p-3">
          <p className="text-sm">
            Delete “{name}”{contents && ` and ${contents}`}? This can't be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" autoFocus onClick={() => idle('delete')}>
              Cancel
            </Button>
            <Button size="sm" variant="danger" onClick={remove}>
              Delete {level}
            </Button>
          </div>
        </div>
      )}
      {row.kind === 'error' && (
        <div className="flex flex-col items-start gap-2">
          <Notice tone="bad">{row.message}</Notice>
          <Button size="sm" variant="secondary" autoFocus onClick={() => idle('edit')}>
            Dismiss
          </Button>
        </div>
      )}
    </div>
  )
}

interface RenameFormProps {
  level: 'subject' | 'topic'
  id: string
  name: string
  onClose: () => void
}

/** The name in a text box, saved with Enter; Escape keeps it as it was. The slug stays. */
function RenameForm({ level, id, name, onClose }: RenameFormProps) {
  const [value, setValue] = useState(name)
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const inputId = useId()

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const problem = nameError(level, value)
    if (problem) {
      setError(problem)
      return focusFirstInvalid(formEl)
    }
    if (value.trim() === name) return onClose()
    setSaving(true)
    const failed = await renameItem(level, id, value.trim())
    if (failed) {
      setError(failed)
      setSaving(false)
      return
    }
    onClose()
  }

  return (
    <form noValidate onSubmit={submit} onKeyDown={closeOnEscape(onClose)} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          id={inputId}
          autoFocus
          aria-label={`New name for ${name}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(undefined)
          }}
          maxLength={NAME_MAX[level]}
          autoComplete="off"
          className="min-w-0 flex-1 basis-48"
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </form>
  )
}

interface AddItemProps {
  level: 'subject' | 'topic'
  parentId: string
  parentName: string
  siblings: Array<Positioned & { slug: string }>
}

/** An "Add subject" or "Add topic" button that opens a one-field form. */
function AddItem({ level, parentId, parentName, siblings }: AddItemProps) {
  const [open, setOpen] = useState(false)
  const buttonId = useId()

  if (open) {
    return (
      <AddItemForm
        level={level}
        parentId={parentId}
        parentName={parentName}
        siblings={siblings}
        onClose={() => {
          setOpen(false)
          focusById(buttonId)
        }}
      />
    )
  }
  return (
    <Button id={buttonId} variant="secondary" size="sm" onClick={() => setOpen(true)}>
      Add {level}
    </Button>
  )
}

/** Stays open after adding, cleared for the next one, until Done. */
function AddItemForm({ level, parentId, parentName, siblings, onClose }: AddItemProps & { onClose: () => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [added, setAdded] = useState<string | null>(null)
  const inputId = useId()
  const focusInput = () => document.getElementById(inputId)?.focus()
  const slug = slugify(name)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setAdded(null)
    const problem =
      nameError(level, name) ??
      (!slug
        ? 'Use at least one letter or digit in the name.'
        : siblings.some((s) => s.slug === slug)
          ? `${parentName} already has a ${level} with this name.`
          : undefined)
    if (problem) {
      setError(problem)
      return focusInput()
    }
    setSaving(true)
    const failed = await addItem(level, parentId, { name: name.trim(), slug, position: nextPosition(siblings) })
    setSaving(false)
    if (failed) {
      setError(failed)
      return focusInput()
    }
    setName('')
    setAdded(name.trim())
    focusInput()
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      onKeyDown={closeOnEscape(onClose)}
      className="flex max-w-md flex-col gap-3 rounded-lg bg-ink/5 p-3"
    >
      <TextField
        id={inputId}
        label={`New ${level} in ${parentName}`}
        autoFocus
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setError(undefined)
        }}
        maxLength={NAME_MAX[level]}
        autoComplete="off"
        hint={slug ? `Slug: ${slug}` : 'Its slug is made from the name.'}
        error={error}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Adding…' : `Add ${level}`}
        </Button>
        <Button size="sm" variant="secondary" onClick={onClose}>
          Done
        </Button>
      </div>
      {added && (
        <p role="status" className="text-sm font-bold text-ok">
          Added “{added}”.
        </p>
      )}
    </form>
  )
}

interface ExamEditorProps {
  /** Null to add one. */
  exam: CatalogExam | null
  exams: CatalogExam[]
  /** With the slug of the exam saved, or null if cancelled. */
  onClose: (slug: string | null) => void
}

/** Adds an exam, or edits one's name, full name and category. */
function ExamEditor({ exam, exams, onClose }: ExamEditorProps) {
  const [form, setForm] = useState<ExamForm>(() =>
    exam ? { name: exam.name, fullName: exam.full_name ?? '', category: exam.category, slug: exam.slug } : NEW_EXAM,
  )
  const [showErrors, setShowErrors] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const headingId = useId()
  // An exam's slug is in its address, so only a new exam's can be chosen.
  const takenSlugs = exam ? null : exams.map((e) => e.slug)
  const errors = showErrors ? examErrors(form, takenSlugs) : {}

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    setShowErrors(true)
    setFormError(null)
    const { category } = form
    if (Object.keys(examErrors(form, takenSlugs)).length > 0 || !category) return focusFirstInvalid(formEl)

    setSaving(true)
    const input = examInput({ ...form, category })
    const failed = exam ? await updateExam(exam.id, input) : await addExam(input, nextPosition(exams))
    if (failed) {
      setFormError(failed)
      setSaving(false)
      return
    }
    onClose(input.slug)
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      onKeyDown={closeOnEscape(() => onClose(null))}
      aria-labelledby={headingId}
      className="flex flex-col gap-4"
    >
      <h2 id={headingId} className="text-lg font-bold">
        {exam ? `Edit ${exam.name}` : 'New exam'}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Short name"
          autoFocus
          value={form.name}
          onChange={(e) => setForm((f) => renameExam(f, e.target.value))}
          maxLength={NAME_MAX.exam}
          placeholder="e.g. SSC CGL"
          autoComplete="off"
          error={errors.name}
        />
        <SelectField
          label="Category"
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExamForm['category'] }))}
          error={errors.category}
        >
          <option value="">Choose…</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </SelectField>
        <div className="sm:col-span-2">
          <TextField
            label="Full name"
            optional
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            placeholder="e.g. Staff Selection Commission, Combined Graduate Level"
            autoComplete="off"
          />
        </div>
        {exam ? (
          <p className="text-sm text-ink/60 sm:col-span-2">
            Slug <code className="font-mono text-ink">{exam.slug}</code> stays the same: it's in the exam's address.
          </p>
        ) : (
          <TextField
            label="Slug"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            hint={`Made from the name. In the exam's address: /exams/${form.slug || '…'}`}
            error={errors.slug}
          />
        )}
      </div>
      {formError && <Notice tone="bad">{formError}</Notice>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : exam ? 'Save exam' : 'Add exam'}
        </Button>
        <Button variant="secondary" onClick={() => onClose(null)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export function TaxonomyTreeSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <LoadingLabel>Loading the exams and topics…</LoadingLabel>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-56 max-w-full" />
        <Skeleton className="h-8 w-24 shrink-0" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Card key={i} className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-64 max-w-full" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-8 w-48" />
          </Card>
        ))}
      </div>
    </div>
  )
}
