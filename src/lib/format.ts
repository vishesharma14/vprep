/** "1 question", "12 questions". */
export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`
}

/** "45s", "4m 05s", "1h 02m". Rounds to the nearest second. */
export function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (hours > 0) return `${hours}h ${pad(minutes)}m`
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`
  return `${seconds}s`
}
