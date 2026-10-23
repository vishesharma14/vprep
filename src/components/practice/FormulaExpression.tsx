import { cx } from '../../lib/cx'

/** A formula's expression, in the highlighted block used wherever formulas are shown. */
export function FormulaExpression({ expression, className }: { expression: string; className?: string }) {
  return (
    <p className={cx('break-words rounded-lg border-l-4 border-drop bg-drop/5 px-4 py-3 font-mono', className)}>
      {expression}
    </p>
  )
}
