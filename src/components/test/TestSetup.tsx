import { useState } from 'react'
import { formatDuration, plural } from '../../lib/format'
import { PageHeader } from '../layout/PageHeader'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ChoiceChips } from '../ui/ChoiceChips'

const COUNT_PRESETS = [5, 10, 15]
const SECONDS_PER_QUESTION = [45, 60, 90]

interface TestSetupProps {
  title: string
  /** Where the questions come from, e.g. "GATE CSE / Algorithms". */
  context?: string
  /** Questions available in the scope. */
  available: number
  onStart: (count: number, secondsPerQuestion: number) => void
}

/** Choose how many questions and how long for each, then start. */
export function TestSetup({ title, context, available, onStart }: TestSetupProps) {
  const counts = [
    ...COUNT_PRESETS.filter((n) => n < available).map((n) => ({ value: n, label: String(n) })),
    { value: available, label: `All ${available}` },
  ]
  const [count, setCount] = useState(() => (available > 10 ? 10 : available))
  const [seconds, setSeconds] = useState(60)

  return (
    <div className="mx-auto w-full max-w-xl">
      <PageHeader title={title} description={context} />
      <Card className="flex flex-col gap-6">
        <p className="font-mono text-sm text-ink/70">
          {plural(available, 'question')} available, picked at random
        </p>
        <ChoiceChips legend="Questions" options={counts} value={count} onChange={setCount} />
        <ChoiceChips
          legend="Time per question"
          options={SECONDS_PER_QUESTION.map((s) => ({ value: s, label: `${s} s` }))}
          value={seconds}
          onChange={setSeconds}
        />
        <dl>
          <dt className="text-sm font-bold">Total time</dt>
          <dd className="font-display text-3xl font-bold">{formatDuration(count * seconds * 1000)}</dd>
        </dl>
        <p className="rounded-lg bg-ink/5 px-3 py-2 text-sm text-ink/80">
          Answers and explanations appear after you submit.
        </p>
        <Button onClick={() => onStart(count, seconds)} className="w-full sm:w-auto sm:self-start">
          Start test
        </Button>
      </Card>
    </div>
  )
}
