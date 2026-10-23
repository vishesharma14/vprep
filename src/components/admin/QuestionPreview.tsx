import type { CatalogExam } from '../../hooks/useExamCatalog'
import { cx } from '../../lib/cx'
import { parseYear, type QuestionForm } from '../../lib/questions'
import type { Formula } from '../../types'
import { FormulaExpression } from '../practice/FormulaExpression'
import { OptionList } from '../practice/OptionList'
import { QuestionTags } from '../practice/QuestionTags'
import { Card } from '../ui/Card'

const sectionLabelClass = 'font-mono text-[0.6875rem] font-medium uppercase tracking-widest'

// The options can't be chosen in the preview.
const ignore = () => {}

interface QuestionPreviewProps {
  form: QuestionForm
  /** Null for a question not saved yet. */
  code: string | null
  exams: CatalogExam[]
  formulas: Formula[]
}

/**
 * The question as the practice screen shows it once answered: the options
 * with the correct one marked, then the hint, explanation and formula.
 */
export function QuestionPreview({ form, code, exams, formulas }: QuestionPreviewProps) {
  const exam = exams.find((e) => e.id === form.examId)
  const subject = exam?.subjects.find((s) => s.id === form.subjectId)
  const topic = subject?.topics.find((t) => t.id === form.topicId)
  const formula = formulas.find((f) => f.id === form.formulaId)
  const body = form.body.trim()
  const hint = form.hint.trim()
  const explanation = form.explanation.trim()

  return (
    <Card className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <p className="font-mono text-xs uppercase tracking-wider text-ink/60">
            {exam?.name ?? 'Exam'} <span aria-hidden>/</span> {subject?.name ?? 'Subject'} <span aria-hidden>/</span>{' '}
            {topic?.name ?? 'Topic'}
          </p>
          <span className="shrink-0 font-mono text-xs text-ink/50">{code ?? 'New'}</span>
        </div>
        <QuestionTags
          question={{
            subtopic: form.subtopic.trim() || null,
            difficulty: form.difficulty,
            type: form.type,
            year: parseYear(form.year),
            source: form.source.trim() || null,
          }}
        />
      </header>

      <p className={cx('whitespace-pre-line break-words text-lg leading-relaxed', !body && 'text-ink/50')}>
        {body || 'The question shows here.'}
      </p>

      <OptionList
        options={form.options.map((text) => text.trim() || '(blank)')}
        selected={null}
        onSelect={ignore}
        // -1 locks the options without marking one, until the correct one is chosen.
        answerIndex={form.answerIndex ?? -1}
      />

      {hint && (
        <div className="rounded-lg bg-pen/5 px-4 py-3">
          <p className={cx(sectionLabelClass, 'text-pen')}>Hint</p>
          <p className="mt-1 whitespace-pre-line break-words">{hint}</p>
        </div>
      )}

      <div className="flex flex-col gap-4 border-t border-ink/10 pt-4">
        <section>
          <h4 className="font-bold">Explanation</h4>
          <p className={cx('mt-1 whitespace-pre-line break-words', !explanation && 'text-ink/60')}>
            {explanation || 'No explanation yet.'}
          </p>
        </section>
        {formula && (
          <section>
            <h4 className="font-bold">Formula</h4>
            <p className="mt-1">{formula.name}</p>
            <FormulaExpression expression={formula.expression} className="mt-2" />
            {formula.note && <p className="mt-2 text-sm text-ink/70">{formula.note}</p>}
          </section>
        )}
      </div>
    </Card>
  )
}
