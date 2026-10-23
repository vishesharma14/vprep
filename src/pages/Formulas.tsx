import { useId, useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { FormulaExpression } from '../components/practice/FormulaExpression'
import { ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { TextField } from '../components/ui/Field'
import { LoadError } from '../components/ui/LoadError'
import { LoadingLabel, Skeleton } from '../components/ui/Skeleton'
import { useAsync } from '../hooks/useAsync'
import { dbErrorMessage, SESSION_EXPIRED } from '../lib/errors'
import { plural } from '../lib/format'
import { neon } from '../lib/neon'
import { matchesEveryWord, searchWords } from '../lib/search'
import { withSessionRecovery } from '../lib/session'
import type { FormulaCatalogRow } from '../types'

/** Groups in this order; any others follow, A to Z. */
const GROUP_ORDER = [
  'Arithmetic',
  'Algebra & Calculus',
  'Trigonometry & Logs',
  'Physics',
  'Chemistry',
  'Computer Science',
  'Probability & Statistics',
]

const byName = new Intl.Collator('en', { numeric: true }).compare

const gridClass = 'grid gap-4 sm:grid-cols-2'

interface FormulaGroup {
  name: string
  formulas: FormulaCatalogRow[]
}

async function fetchFormulas() {
  const { data, error, status, expired } = await withSessionRecovery(() => neon.from('formula_catalog').select('*'))
  if (error) throw new Error(expired ? SESSION_EXPIRED : dbErrorMessage(error, status))
  return data as FormulaCatalogRow[]
}

/** Formulas by group (in GROUP_ORDER), each group A to Z. */
function groupFormulas(formulas: FormulaCatalogRow[]): FormulaGroup[] {
  const groups = new Map<string, FormulaCatalogRow[]>()
  for (const formula of [...formulas].sort((a, b) => byName(a.name, b.name))) {
    groups.set(formula.group_name, [...(groups.get(formula.group_name) ?? []), formula])
  }
  const rank = (group: string) => {
    const index = GROUP_ORDER.indexOf(group)
    return index === -1 ? GROUP_ORDER.length : index
  }
  return [...groups]
    .sort(([a], [b]) => rank(a) - rank(b) || byName(a, b))
    .map(([name, formulas]) => ({ name, formulas }))
}

export function Formulas() {
  const formulas = useAsync(fetchFormulas)
  const [filter, setFilter] = useState('')

  return (
    <>
      <PageHeader title="Formulas" description="Key formulas by subject, and the questions that use them." />
      <div className="sm:max-w-md">
        <TextField
          label="Find a formula"
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="A name, symbol or subject"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
        />
      </div>

      <div className="mt-8">
        {formulas.status === 'error' ? (
          <LoadError message={`Couldn't load the formulas. ${formulas.error}`} onRetry={formulas.retry} />
        ) : formulas.status === 'loading' ? (
          <FormulasSkeleton />
        ) : (
          <FormulaLibrary formulas={formulas.data} filter={filter} />
        )}
      </div>
    </>
  )
}

function FormulaLibrary({ formulas, filter }: { formulas: FormulaCatalogRow[]; filter: string }) {
  const words = searchWords(filter)
  const shown = formulas.filter((f) => matchesEveryWord([f.name, f.expression, f.group_name, f.note], words))

  if (formulas.length === 0) {
    return (
      <Card>
        <p className="text-ink/70">No formulas yet.</p>
      </Card>
    )
  }

  return (
    <>
      {/* Says how many match while filtering; empty otherwise. */}
      <p role="status" className={words.length > 0 && shown.length > 0 ? 'mb-6 text-sm text-ink/70' : 'sr-only'}>
        {words.length === 0
          ? ''
          : shown.length === 0
            ? 'No formulas match.'
            : `Showing ${shown.length} of ${plural(formulas.length, 'formula')}`}
      </p>
      {shown.length === 0 ? (
        <Card>
          <p className="break-words">
            No formulas match "{filter.trim()}". Try a shorter word, or a symbol from the formula.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-10">
          {groupFormulas(shown).map((group) => (
            <FormulaSection key={group.name} group={group} />
          ))}
        </div>
      )}
    </>
  )
}

function FormulaSection({ group }: { group: FormulaGroup }) {
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
        {group.formulas.map((formula) => (
          <li key={formula.id}>
            <FormulaCard formula={formula} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function FormulaCard({ formula }: { formula: FormulaCatalogRow }) {
  const count = formula.question_count
  return (
    <Card className="flex h-full flex-col gap-3">
      <h3 className="font-bold">{formula.name}</h3>
      <FormulaExpression expression={formula.expression} />
      {formula.note && <p className="text-sm text-ink/70">{formula.note}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        <p className="font-mono text-xs text-ink/60">Used in {plural(count, 'question')}</p>
        {count > 0 && (
          <ButtonLink
            to={`/practice?ids=${formula.question_ids.join(',')}`}
            variant="secondary"
            size="sm"
            aria-label={`Practise ${plural(count, 'question')} using ${formula.name}`}
          >
            Practise
          </ButtonLink>
        )}
      </div>
    </Card>
  )
}

function FormulasSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <LoadingLabel>Loading the formulas…</LoadingLabel>
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
                <Skeleton className="h-8 w-24" />
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
