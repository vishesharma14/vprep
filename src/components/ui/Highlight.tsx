const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `text` with every occurrence of `words` marked, ignoring case. Partial words match. */
export function Highlight({ text, words }: { text: string; words: string[] }) {
  // Longest first, so "probability" wins over "prob" where both match.
  const pattern = [...words]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')
  if (!pattern) return text

  // With a capture group, split() puts the matches at the odd indexes.
  const parts = text.split(new RegExp(`(${pattern})`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-pen/15 text-pen">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  )
}
