import { useEffect, useRef } from 'react'
import { Notice } from '../ui/Notice'

export interface NoteMessage {
  tone: 'ok' | 'bad'
  text: string
}

/**
 * A Notice that takes focus each time it is given a new `note` object, e.g.
 * after a delete, when the item that had focus is gone.
 */
export function FocusNote({ note }: { note: NoteMessage }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => ref.current?.focus(), [note])
  return (
    <div ref={ref} tabIndex={-1} className="outline-none">
      <Notice tone={note.tone}>{note.text}</Notice>
    </div>
  )
}
