/** "1 question", "12 questions". */
export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`
}

/** Countdown time: "04:05", and "75:00" past an hour. Rounds up, so "00:00" means time is up. */
export function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
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

const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

/** "22 Oct 2026", in the learner's time zone. */
export function formatDate(iso: string) {
  return dateFormat.format(new Date(iso))
}

// The day is already in the learner's time zone, so it is read and shown as UTC.
const dayFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** "23 Oct" for "2026-10-23". */
export function formatDay(day: string) {
  return dayFormat.format(new Date(`${day}T00:00:00Z`))
}
