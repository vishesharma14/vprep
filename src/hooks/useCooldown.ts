import { useCallback, useEffect, useState } from 'react'

/**
 * A wait of `seconds` before something may be done again, such as emailing
 * another code. `remaining` counts down whole seconds to 0; start() begins a
 * new wait. With `startNow`, the first wait begins at once.
 */
export function useCooldown(seconds: number, startNow = false) {
  const [until, setUntil] = useState(() => (startNow ? Date.now() + seconds * 1000 : 0))
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (until <= now) return
    // Tick when the next whole second is up.
    const timer = setTimeout(() => setNow(Date.now()), (until - now) % 1000 || 1000)
    return () => clearTimeout(timer)
  }, [until, now])

  const start = useCallback(() => {
    const t = Date.now()
    setNow(t)
    setUntil(t + seconds * 1000)
  }, [seconds])

  return { remaining: Math.max(0, Math.ceil((until - now) / 1000)), start }
}
