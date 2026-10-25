import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useBlocker, useLocation, useNavigate } from 'react-router-dom'
import { useAsync } from '../../hooks/useAsync'
import { useAdminSimilarQuestions } from '../../hooks/useAdminEmbeddings'
import { saveQuestion, type AdminQuestion } from '../../hooks/useAdminQuestions'
import { findTopic, type CatalogExam } from '../../hooks/useExamCatalog'
import { optionLetter } from '../../lib/attempts'
import { cx } from '../../lib/cx'
import { plural } from '../../lib/format'
import { fetchFormulas } from '../../lib/formulas'
import {
  blankOptions,
  MAX_OPTIONS,
  MIN_OPTIONS,
  NEW_QUESTION,
  questionErrors,
  questionInput,
  YEAR_MAX,
  YEAR_MIN,
  type QuestionForm,
} from '../../lib/questions'
import { isPossibleDuplicate, similarityPercent } from '../../lib/similar'
import type { Difficulty, Formula, Question, QuestionStatus, QuestionType } from '../../types'
import { Bubble } from '../ui/Bubble'
import { Button, ButtonLink } from '../ui/Button'
import { Card } from '../ui/Card'
import { ChoiceChips } from '../ui/ChoiceChips'
import { SelectField, TextAreaField, TextField, TextInput } from '../ui/Field'
import { CrossIcon } from '../ui/Icon'
import { LoadError } from '../ui/LoadError'
import { Notice } from '../ui/Notice'
import { LoadingLabel, Skeleton } from '../ui/Skeleton'
import { DEFAULT_LIST, listSearchOf } from './listSearch'
import { QuestionPreview } from './QuestionPreview'
import type { SavedNotice } from './QuestionList'
import { SimilarQuestionsPanel } from './SimilarQuestionsPanel'
import { StatusPill } from './StatusPill'

const DIFFICULTIES: Array<{ value: Difficulty; label: string }> = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

const TYPES: Array<{ value: QuestionType; label: string }> = [
  { value: 'practice', label: 'Practice' },
  { value: 'pyq', label: 'PYQ' },
]

const STATUSES: Array<{ value: QuestionStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'In review' },
  { value: 'published', label: 'Published' },
]

/** "Q1055 saved as draft", after a save. */
const SAVED_AS: Record<QuestionStatus, string> = {
  draft: 'saved as draft',
  in_review: 'saved for review',
  published: 'saved and published',
}

const byName = new Intl.Collator('en', { numeric: true }).compare

/** Formulas by group, in the order given. */
function groupFormulas(formulas: Formula[]) {
  const groups = new Map<string, Formula[]>()
  for (const formula of formulas) groups.set(formula.group_name, [...(groups.get(formula.group_name) ?? []), formula])
  return groups
}

/** The editor's fields for a saved question. */
function formOf(question: Question, exams: CatalogExam[]): QuestionForm {
  const place = findTopic(exams, question.topic_id)
  return {
    examId: place?.exam.id ?? '',
    subjectId: place?.subject.id ?? '',
    topicId: place ? question.topic_id : '',
    subtopic: question.subtopic ?? '',
    tags: question.tags.join(', '),
    body: question.body,
    options: [...question.options],
    answerIndex: question.answer_index,
    hint: question.hint ?? '',
    explanation: question.explanation ?? '',
    formulaId: question.formula_id ?? '',
    difficulty: question.difficulty,
    type: question.type,
    year: question.year === null ? '' : String(question.year),
    source: question.source ?? '',
    status: question.status,
  }
}

/** Moves focus to the first field marked invalid, once React has rendered the errors. */
function focusFirstInvalid(form: HTMLFormElement) {
  requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
}

interface QuestionEditorProps {
  exams: CatalogExam[]
  questions: AdminQuestion[]
  /** The question to edit, from ?id=; null for a new one. */
  id: string | null
}

/** Adds a question, or edits the one with `id`, with a live preview. */
export function QuestionEditor({ exams, questions, id }: QuestionEditorProps) {
  const formulas = useAsync(fetchFormulas)
  const question = id ? questions.find((q) => q.id === id) : undefined

  if (id && !question) {
    return (
      <Card className="flex max-w-md flex-col items-start gap-4">
        <p>There's no question with this id. It may have been deleted.</p>
        <ButtonLink to={{ search: DEFAULT_LIST }}>Back to questions</ButtonLink>
      </Card>
    )
  }
  if (formulas.status === 'error') {
    return <LoadError message={`Couldn't load the formulas. ${formulas.error}`} onRetry={formulas.retry} />
  }
  if (formulas.status === 'loading') return <QuestionEditorSkeleton />
  // A new key starts a fresh form, e.g. going from editing a question to adding one.
  return (
    <EditorForm
      key={id ?? 'new'}
      question={question ?? null}
      exams={exams}
      questions={questions}
      formulas={formulas.data}
    />
  )
}

interface EditorFormProps {
  question: AdminQuestion | null
  exams: CatalogExam[]
  questions: AdminQuestion[]
  formulas: Formula[]
}

function EditorForm({ question, exams, questions, formulas }: EditorFormProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const listSearch = listSearchOf(location.state)
  const [initial] = useState(() => (question ? formOf(question, exams) : NEW_QUESTION))
  const [form, setForm] = useState(initial)
  const [showErrors, setShowErrors] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Set once saved, so leaving for the list isn't stopped.
  const saved = useRef(false)
  const similar = useAdminSimilarQuestions(question?.id ?? null)
  const duplicates = similar.status === 'ready' ? similar.data.filter((q) => isPossibleDuplicate(q.similarity)) : []
  const ids = useId()
  const fieldId = (name: string) => `${ids}-${name}`

  const errors = showErrors ? questionErrors(form) : {}
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  // Leaving with unsaved changes asks first: links, tabs and Back inside the
  // app through the router, closing or reloading the tab through the browser.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !saved.current &&
      (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
  )
  useEffect(() => {
    if (!dirty) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      // Older browsers only ask when returnValue is set.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const exam = exams.find((e) => e.id === form.examId)
  const subject = exam?.subjects.find((s) => s.id === form.subjectId)
  // Subtopics already used in the topic, offered as suggestions.
  const subtopics = [
    ...new Set(questions.filter((q) => q.topic_id === form.topicId && q.subtopic).map((q) => q.subtopic as string)),
  ].sort(byName)
  const formulaGroups = groupFormulas(formulas)

  function set<K extends keyof QuestionForm>(key: K, value: QuestionForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function setOption(index: number, text: string) {
    setForm((f) => ({ ...f, options: f.options.map((o, i) => (i === index ? text : o)) }))
  }

  function addOption() {
    setForm((f) => (f.options.length < MAX_OPTIONS ? { ...f, options: [...f.options, ''] } : f))
    // Straight to typing in the new option.
    requestAnimationFrame(() => document.getElementById(fieldId(`option-${form.options.length}`))?.focus())
  }

  function removeOption(index: number) {
    setForm((f) => {
      if (f.options.length <= MIN_OPTIONS) return f
      const answer = f.answerIndex
      return {
        ...f,
        options: f.options.filter((_, i) => i !== index),
        // The correct option keeps its mark as the ones above it move up.
        answerIndex: answer === null || answer === index ? null : answer > index ? answer - 1 : answer,
      }
    })
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    setShowErrors(true)
    setFormError(null)
    if (Object.keys(questionErrors(form)).length > 0) return focusFirstInvalid(formEl)

    setSaving(true)
    const result = await saveQuestion(questionInput(form), question?.id ?? null)
    if (result.error !== undefined) {
      setFormError(`Couldn't save the question. ${result.error}`)
      setSaving(false)
      return
    }
    saved.current = true
    const notice: SavedNotice = { id: result.question.id, text: `${result.question.code} ${SAVED_AS[result.question.status]}` }
    navigate({ search: listSearch }, { replace: true, state: { saved: notice } })
  }

  // The "where" error goes on the first of the three selects still to choose.
  const placeError = (field: 'exam' | 'subject' | 'topic') => {
    const first = !form.examId ? 'exam' : !form.subjectId ? 'subject' : 'topic'
    return field === first ? errors.topic : undefined
  }
  const blank = new Set(showErrors ? blankOptions(form.options) : [])
  const optionsErrorId = fieldId('options-error')
  const answerErrorId = fieldId('answer-error')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold">{question ? `Edit ${question.code}` : 'New question'}</h2>
        {question && <StatusPill status={question.status} />}
      </div>
      {question && question.attempts > 0 && (
        <Notice tone="info">
          Learners have attempted this question {plural(question.attempts, 'time')}. Their saved results stay as they
          are if you change the answer.
        </Notice>
      )}
      {duplicates.length > 0 && (
        <Notice tone="info">
          Possible duplicate of{' '}
          {duplicates.map((q) => `${q.code} (${similarityPercent(q.similarity)}% similar)`).join(', ')}. Compare them
          under Similar questions, below the form.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <form noValidate onSubmit={submit} className="flex flex-col gap-6 @container">
          <Section title="Where it goes">
            <div className="grid gap-4 @lg:grid-cols-3">
              <SelectField
                label="Exam"
                value={form.examId}
                onChange={(e) => setForm((f) => ({ ...f, examId: e.target.value, subjectId: '', topicId: '' }))}
                error={placeError('exam')}
              >
                <option value="">Choose…</option>
                {exams.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Subject"
                value={form.subjectId}
                disabled={!exam}
                onChange={(e) => setForm((f) => ({ ...f, subjectId: e.target.value, topicId: '' }))}
                error={placeError('subject')}
              >
                <option value="">{exam ? 'Choose…' : 'Choose an exam first'}</option>
                {exam?.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Topic"
                value={form.topicId}
                disabled={!subject}
                onChange={(e) => set('topicId', e.target.value)}
                error={placeError('topic')}
              >
                <option value="">{subject ? 'Choose…' : 'Choose a subject first'}</option>
                {subject?.topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="grid gap-4 @lg:grid-cols-2">
              <TextField
                label="Subtopic"
                optional
                value={form.subtopic}
                onChange={(e) => set('subtopic', e.target.value)}
                list={fieldId('subtopics')}
                autoComplete="off"
              />
              <datalist id={fieldId('subtopics')}>
                {subtopics.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <TextField
                label="Tags"
                optional
                value={form.tags}
                onChange={(e) => set('tags', e.target.value)}
                hint="Separate with commas: discount, markup"
                autoComplete="off"
              />
            </div>
          </Section>

          <Section title="Question">
            <TextAreaField
              label="Question"
              rows={5}
              value={form.body}
              onChange={(e) => set('body', e.target.value)}
              hint="Line breaks are kept."
              error={errors.body}
            />

            <fieldset
              className="flex min-w-0 flex-col gap-3"
              aria-describedby={cx(errors.options && optionsErrorId, errors.answer && answerErrorId) || undefined}
            >
              <legend className="text-sm font-bold">Options</legend>
              <p className="-mt-1.5 text-sm text-ink/60">
                Mark the correct answer with its circle. {MIN_OPTIONS} to {MAX_OPTIONS} options.
              </p>
              <ol className="flex flex-col gap-2">
                {form.options.map((text, i) => {
                  const letter = optionLetter(i)
                  const correct = form.answerIndex === i
                  return (
                    <li key={i} className="flex items-center gap-2">
                      <label
                        className={cx(
                          'group shrink-0 cursor-pointer rounded-full',
                          'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-pen',
                        )}
                      >
                        <input
                          type="radio"
                          name={fieldId('answer')}
                          checked={correct}
                          onChange={() => set('answerIndex', i)}
                          aria-invalid={i === 0 && errors.answer ? true : undefined}
                          className="sr-only"
                        />
                        <Bubble label={letter} state={correct ? 'correct' : 'empty'} />
                        <span className="sr-only">Option {letter} is correct</span>
                      </label>
                      <TextInput
                        id={fieldId(`option-${i}`)}
                        className="min-w-0"
                        aria-label={`Option ${letter}`}
                        aria-invalid={blank.has(i) ? true : undefined}
                        aria-describedby={blank.has(i) ? optionsErrorId : undefined}
                        value={text}
                        onChange={(e) => setOption(i, e.target.value)}
                        autoComplete="off"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        aria-label={`Remove option ${letter}`}
                        disabled={form.options.length <= MIN_OPTIONS}
                        onClick={() => removeOption(i)}
                      >
                        <CrossIcon />
                      </Button>
                    </li>
                  )
                })}
              </ol>
              {errors.options && (
                <p id={optionsErrorId} className="text-sm text-bad">
                  {errors.options}
                </p>
              )}
              {errors.answer && (
                <p id={answerErrorId} className="text-sm text-bad">
                  {errors.answer}
                </p>
              )}
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                disabled={form.options.length >= MAX_OPTIONS}
                onClick={addOption}
              >
                Add option
              </Button>
            </fieldset>
          </Section>

          <Section title="Help for learners">
            <TextAreaField
              label="Hint"
              optional
              rows={2}
              value={form.hint}
              onChange={(e) => set('hint', e.target.value)}
            />
            <TextAreaField
              label="Explanation"
              rows={4}
              value={form.explanation}
              onChange={(e) => set('explanation', e.target.value)}
              hint="Needed to publish."
              error={errors.explanation}
            />
            <SelectField
              label="Linked formula"
              optional
              value={form.formulaId}
              onChange={(e) => set('formulaId', e.target.value)}
            >
              <option value="">None</option>
              {[...formulaGroups].map(([group, items]) => (
                <optgroup key={group} label={group}>
                  {items.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectField>
          </Section>

          <Section title="Details">
            <ChoiceChips
              legend="Difficulty"
              options={DIFFICULTIES}
              value={form.difficulty}
              onChange={(value) => set('difficulty', value)}
            />
            <ChoiceChips legend="Type" options={TYPES} value={form.type} onChange={(value) => set('type', value)} />
            {form.type === 'pyq' && (
              <div className="@lg:max-w-48">
                <TextField
                  label="Year"
                  inputMode="numeric"
                  maxLength={4}
                  value={form.year}
                  onChange={(e) => set('year', e.target.value)}
                  hint={`The year it was asked, ${YEAR_MIN}–${YEAR_MAX}.`}
                  error={errors.year}
                />
              </div>
            )}
            <TextField
              label="Source"
              optional
              value={form.source}
              onChange={(e) => set('source', e.target.value)}
              placeholder="e.g. SSC CGL 2023 Tier 1"
            />
            <ChoiceChips
              legend="Status"
              options={STATUSES}
              value={form.status}
              onChange={(value) => set('status', value)}
            />
            <p className="-mt-2 text-sm text-ink/60">Learners only see published questions.</p>
          </Section>

          <div className="flex flex-col gap-3">
            {formError && <Notice tone="bad">{formError}</Notice>}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save question'}
              </Button>
              <ButtonLink to={{ search: listSearch }} variant="secondary">
                Cancel
              </ButtonLink>
              {dirty && <p className="text-sm text-ink/60">Unsaved changes</p>}
            </div>
          </div>
        </form>

        <PreviewPanel>
          <QuestionPreview form={form} code={question?.code ?? null} exams={exams} formulas={formulas} />
        </PreviewPanel>
      </div>

      {question && <SimilarQuestionsPanel similar={similar} listSearch={listSearch} />}

      {blocker.state === 'blocked' && <LeaveDialog onStay={blocker.reset} onLeave={blocker.proceed} />}
    </div>
  )
}

/** A card with a heading, labelling the part of the form inside it. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId}>
      <Card className="flex flex-col gap-4">
        <h3 id={headingId} className="text-lg font-bold">
          {title}
        </h3>
        {children}
      </Card>
    </section>
  )
}

/** Beside the form on wide screens, staying in view while it scrolls; below it on narrow ones. */
function PreviewPanel({ children }: { children: ReactNode }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 lg:sticky lg:top-6">
      <div>
        <h3 id={headingId} className="text-lg font-bold">
          Preview
        </h3>
        <p className="text-sm text-ink/60">How learners see it after answering.</p>
      </div>
      {children}
    </section>
  )
}

/** Asks before leaving the editor with unsaved changes. */
function LeaveDialog({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-text`}
      // Escape keeps editing.
      onClose={onStay}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-ink/10 bg-sheet p-6 text-ink shadow-xl backdrop:bg-ink/40"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-title`} className="text-xl font-bold">
            Leave without saving?
          </h2>
          <p id={`${id}-text`} className="text-ink/70">
            Your changes to this question haven't been saved and will be lost.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {/* The safe choice takes focus. Closing hands focus back to where it was, then calls onStay. */}
          <Button autoFocus onClick={() => dialogRef.current?.close()}>
            Keep editing
          </Button>
          <Button variant="secondary" onClick={onLeave}>
            Leave without saving
          </Button>
        </div>
      </div>
    </dialog>
  )
}

export function QuestionEditorSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <LoadingLabel>Loading the editor…</LoadingLabel>
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          {[3, 2, 3].map((fields, i) => (
            <Card key={i} className="flex flex-col gap-4">
              <Skeleton className="h-6 w-36" />
              {Array.from({ length: fields }, (_, j) => (
                <div key={j} className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-11" />
                </div>
              ))}
            </Card>
          ))}
        </div>
        <Card className="flex flex-col gap-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-6 w-full" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </Card>
      </div>
    </div>
  )
}
