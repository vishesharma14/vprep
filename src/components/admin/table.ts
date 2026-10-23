import { cx } from '../../lib/cx'

// Classes shared by the admin tables (ScrollTable), which scroll both ways
// inside their card with the header row stuck to the top.

export const labelClass = 'font-mono text-[0.6875rem] font-medium uppercase tracking-widest text-drop'

// The outer cells line up with the card's padding.
export const cellClass = 'px-3 py-3 align-top first:pl-5 last:pr-5'

const headBase = cx(cellClass, 'sticky top-0 bg-sheet font-medium')

export const headClass = cx(headBase, 'z-[1]')

/**
 * The actions column, pinned to the right edge so it stays in view while the
 * rest of the table scrolls sideways. Its cells need a solid background.
 */
export const pinnedClass =
  'sticky right-0 shadow-[inset_1px_0_0_color-mix(in_oklab,var(--color-ink)_10%,transparent)]'

/** The pinned column's header: stuck to the top and the right, above both. */
export const pinnedHeadClass = cx(headBase, pinnedClass, 'z-[2]')

/** bg-pen/5 over the card, made solid for a pinned cell in a highlighted row. */
export const pinnedHighlightClass = 'bg-[color-mix(in_oklab,var(--color-pen)_5%,var(--color-sheet))]'
