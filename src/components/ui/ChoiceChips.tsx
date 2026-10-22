import { useId } from 'react'
import { cx } from '../../lib/cx'

interface ChoiceChipsProps<T extends string | number> {
  legend: string
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}

/** Pick one of a few options, shown as a row of chips (radio buttons underneath). */
export function ChoiceChips<T extends string | number>({ legend, options, value, onChange }: ChoiceChipsProps<T>) {
  const name = useId()
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-bold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = option.value === value
          return (
            <label
              key={option.value}
              className={cx(
                'inline-flex h-9 cursor-pointer items-center rounded-full border px-4 text-sm font-bold transition-colors',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-pen',
                checked
                  ? 'border-pen bg-pen text-sheet'
                  : 'border-ink/15 bg-sheet text-ink/75 hover:border-pen hover:text-pen',
              )}
            >
              <input
                type="radio"
                name={name}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
