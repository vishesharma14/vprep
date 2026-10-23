import type { BookmarkToggle } from '../../hooks/useBookmarks'
import { cx } from '../../lib/cx'
import { Button } from '../ui/Button'
import { BookmarkIcon } from '../ui/Icon'
import { SignInIconLink } from './SignInIconLink'

/** Bookmarks a question, or removes its bookmark. Get `bookmark` from useBookmarkToggle(). */
export function BookmarkButton({ bookmark, code }: { bookmark: BookmarkToggle; code: string }) {
  if (!bookmark.signedIn) {
    return (
      <SignInIconLink label="Sign in to bookmark this question">
        <BookmarkIcon />
      </SignInIconLink>
    )
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-pressed={bookmark.bookmarked}
      aria-label={`Bookmark ${code}`}
      title={bookmark.bookmarked ? 'Remove bookmark' : 'Bookmark'}
      onClick={bookmark.toggle}
      className="aria-pressed:bg-pen/10"
    >
      <BookmarkIcon filled={bookmark.bookmarked} />
    </Button>
  )
}

/**
 * What the bookmark button just did. Always rendered, so screen readers
 * announce it; takes no space until there is a message.
 */
export function BookmarkMessage({ bookmark }: { bookmark: BookmarkToggle }) {
  return (
    <p
      role="status"
      className={cx(
        'text-sm [&:not(:empty)]:mt-2',
        bookmark.message?.tone === 'bad' ? 'text-bad' : 'text-ok',
      )}
    >
      {bookmark.message?.text}
    </p>
  )
}
