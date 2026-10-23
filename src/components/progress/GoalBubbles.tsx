import { plural } from '../../lib/format'
import { Bubble } from '../ui/Bubble'
import { ProgressBar } from '../ui/ProgressBar'
import { Tag } from '../ui/Tag'

/** Goals up to 200 are allowed; past this many bubbles they wrap into a block, so a bar is shown instead. */
const MAX_BUBBLES = 50

/** Today's attempts against the daily goal: one OMR bubble per question, filled once done. */
export function GoalBubbles({ done, goal }: { done: number; goal: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="font-mono text-sm">
          <span className="font-medium">{done}</span> of {plural(goal, 'question')} today
        </p>
        {done >= goal && <Tag tone="ok">Goal met</Tag>}
      </div>
      {goal <= MAX_BUBBLES ? (
        <span aria-hidden className="flex flex-wrap gap-1">
          {Array.from({ length: goal }, (_, i) => (
            <Bubble key={i} size="sm" state={i < done ? 'filled' : 'empty'} />
          ))}
        </span>
      ) : (
        <ProgressBar value={done} max={goal} />
      )}
    </div>
  )
}
