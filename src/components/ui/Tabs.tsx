import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '../../lib/cx'

interface TabsProps<T extends string> {
  /** Prefix for the tab and panel ids; give the same one to each TabPanel. */
  id: string
  label: string
  tabs: Array<{ id: T; label: ReactNode }>
  selected: T
  onSelect: (tab: T) => void
  className?: string
}

/** A row of tabs (WAI-ARIA tabs pattern): left and right arrows move between them. */
export function Tabs<T extends string>({ id, label, tabs, selected, onSelect, className }: TabsProps<T>) {
  const refs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({})

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const index = tabs.findIndex((t) => t.id === selected)
    const next = tabs[(index + step + tabs.length) % tabs.length].id
    onSelect(next)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cx('grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-ink/5 p-1', className)}
    >
      {tabs.map((t) => {
        const isSelected = t.id === selected
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${t.id}`}
            aria-selected={isSelected}
            aria-controls={`${id}-panel-${t.id}`}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(t.id)}
            onKeyDown={onKeyDown}
            className={cx(
              'rounded-md px-3 py-2 text-sm font-bold transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen',
              isSelected ? 'bg-sheet text-pen shadow-sm' : 'text-ink/70 hover:text-ink',
            )}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

interface TabPanelProps {
  /** The `id` given to Tabs. */
  id: string
  tab: string
  selected: boolean
  children: ReactNode
}

/** The content of one tab. Render one per tab; only the selected one shows its children. */
export function TabPanel({ id, tab, selected, children }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={`${id}-panel-${tab}`}
      aria-labelledby={`${id}-tab-${tab}`}
      hidden={!selected}
      tabIndex={-1}
      className="outline-none"
    >
      {selected && children}
    </div>
  )
}
