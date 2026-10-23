import { useId, type ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { Card } from '../ui/Card'

interface ScrollTableProps {
  /** Read by screen readers, and names the scrolling region. */
  caption: string
  /** Sets the table's min-width, past which it scrolls sideways. */
  className?: string
  /** The thead and tbody. */
  children: ReactNode
}

/** A table in a card that scrolls both ways inside it. Style its cells with the classes in table.ts. */
export function ScrollTable({ caption, className, children }: ScrollTableProps) {
  const captionId = useId()
  return (
    <Card className="overflow-hidden px-0 py-0">
      {/* Focusable so the keyboard can scroll it too. */}
      <div
        role="region"
        aria-labelledby={captionId}
        tabIndex={0}
        className="max-h-[70vh] overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pen"
      >
        <table className={cx('w-full text-sm', className)}>
          <caption id={captionId} className="sr-only">
            {caption}
          </caption>
          {children}
        </table>
      </div>
    </Card>
  )
}
