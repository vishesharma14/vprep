import { useEffect, useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { neon } from '../lib/neon'

// TODO: remove in Step 5
// Temporary Data API connection check: counts exams and published questions.
type DbCheck =
  | { state: 'loading' }
  | { state: 'ok'; exams: number; questions: number }
  | { state: 'error'; message: string }

async function checkDatabase(): Promise<DbCheck> {
  try {
    // limit(0) rather than head: true, because a HEAD response has no body,
    // so a failed request would come back with an empty error message.
    const [exams, questions] = await Promise.all([
      neon.from('exams').select('id', { count: 'exact' }).limit(0),
      neon
        .from('questions')
        .select('id', { count: 'exact' })
        .eq('status', 'published')
        .limit(0),
    ])
    const error = exams.error ?? questions.error
    if (error) {
      const parts = [error.message, error.details, error.hint, error.code && `Code: ${error.code}`]
      return { state: 'error', message: parts.filter(Boolean).join('\n') }
    }
    return { state: 'ok', exams: exams.count ?? 0, questions: questions.count ?? 0 }
  } catch (err) {
    return { state: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}

function DbStatus() {
  const [check, setCheck] = useState<DbCheck>({ state: 'loading' })

  useEffect(() => {
    let cancelled = false
    checkDatabase().then((result) => {
      if (!cancelled) setCheck(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (check.state === 'loading') {
    return <p className="font-mono text-sm text-ink/60">Checking database connection…</p>
  }
  if (check.state === 'error') {
    return (
      <p role="alert" className="font-mono text-sm whitespace-pre-wrap text-bad">
        Database connection failed:{'\n'}
        {check.message}
      </p>
    )
  }
  return (
    <p className="font-mono text-sm text-ok">
      Database connected: {check.exams} exams, {check.questions} questions
    </p>
  )
}

export function Home() {
  return (
    <>
      <PageHeader title="Home" />
      {/* TODO: remove in Step 5 */}
      <DbStatus />
    </>
  )
}
