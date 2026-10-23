import { Link } from 'react-router-dom'
import { cx } from '../../lib/cx'

export interface FilterChip {
  key: string
  label: string
  /** Shown after the label in brackets. */
  count?: number
  to: string
  active: boolean
}

/**
 * A row of links that filter the page, the active one filled in. Following
 * one replaces the history entry, so Back leaves the page.
 */
export function FilterChips({ label, chips }: { label: string; chips: FilterChip[] }) {
  return (
    <nav aria-label={label} className="min-w-0">
      <ul className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <li key={chip.key} className="max-w-full">
            <Link
              to={chip.to}
              replace
              aria-current={chip.active ? 'true' : undefined}
              className={cx(
                'inline-flex h-9 max-w-full items-center rounded-full border px-4 text-sm font-bold transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen',
                chip.active
                  ? 'border-pen bg-pen text-sheet'
                  : 'border-ink/15 bg-sheet text-ink/75 hover:border-pen hover:text-pen',
              )}
            >
              <span className="truncate">{chip.label}</span>
              {chip.count !== undefined && <span className="shrink-0">&nbsp;({chip.count})</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
