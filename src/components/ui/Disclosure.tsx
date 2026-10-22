import { useId, useState, type ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { ChevronIcon } from './Icon'

/** A labelled section that starts closed and opens when its title is clicked. */
export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <div className="border-t border-ink/10">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'flex w-full items-center gap-2 rounded py-3 text-left font-bold transition-colors hover:text-pen',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen',
        )}
      >
        <ChevronIcon className={cx('size-4 text-ink/50 transition-transform', open && 'rotate-90')} />
        {title}
      </button>
      <div id={panelId} hidden={!open} className="pb-4 pl-6">
        {children}
      </div>
    </div>
  )
}
