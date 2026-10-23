import type { ComponentProps } from 'react'
import { STATES, UNION_TERRITORIES } from '../../lib/regions'
import { SelectField } from '../ui/Field'

type RegionSelectProps = Omit<ComponentProps<typeof SelectField>, 'label' | 'children'> & {
  /** The first option, with an empty value. */
  placeholder?: string
}

/** Picks a state or union territory for profiles.state, grouped as on the sign-up form. */
export function RegionSelect({ placeholder = 'Not selected', ...props }: RegionSelectProps) {
  return (
    <SelectField label="State / UT" name="state" {...props}>
      <option value="">{placeholder}</option>
      <optgroup label="States">
        {STATES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </optgroup>
      <optgroup label="Union territories">
        {UNION_TERRITORIES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </optgroup>
    </SelectField>
  )
}
