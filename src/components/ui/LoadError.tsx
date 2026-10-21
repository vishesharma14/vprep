import { Button } from './Button'
import { Notice } from './Notice'

/** A failed load: the error in a Notice, and a Retry button. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <Notice tone="bad">{message}</Notice>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  )
}
