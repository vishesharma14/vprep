import { useCallback, useEffect, useState } from 'react'

export type AsyncState<T> =
  | { status: 'loading'; data: undefined; error: undefined }
  | { status: 'error'; data: undefined; error: string }
  | { status: 'ready'; data: T; error: undefined }

export type AsyncResult<T> = AsyncState<T> & { retry: () => void }

export const LOADING = { status: 'loading', data: undefined, error: undefined } as const

interface Settled<T> {
  load: () => Promise<T>
  attempt: number
  state: AsyncState<T>
}

/**
 * Runs `load` and tracks its result. Keep `load` stable (module-level, or
 * useMemo/useCallback): a new `load` or retry() starts over from loading.
 * `initial` (e.g. cached data) is shown straight away while `load` runs.
 * `load` should throw an Error whose message can be shown to the learner.
 */
export function useAsync<T>(load: () => Promise<T>, initial?: T): AsyncResult<T> {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled<T> | null>(() =>
    initial === undefined
      ? null
      : { load, attempt: 0, state: { status: 'ready', data: initial, error: undefined } },
  )

  useEffect(() => {
    let cancelled = false
    load().then(
      (data) => {
        if (!cancelled) setSettled({ load, attempt, state: { status: 'ready', data, error: undefined } })
      },
      (err: unknown) => {
        if (cancelled) return
        const error = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
        setSettled({ load, attempt, state: { status: 'error', data: undefined, error } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [load, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  // A result for an older `load` or attempt is stale: show loading instead.
  const current = settled && settled.load === load && settled.attempt === attempt
  return { ...(current ? settled.state : LOADING), retry }
}
