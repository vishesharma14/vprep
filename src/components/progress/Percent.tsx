/** A whole percentage, or a dash (read out as "None yet") when there is nothing to divide by. */
export function Percent({ value }: { value: number | null }) {
  if (value !== null) return <>{value}%</>
  return (
    <>
      <span aria-hidden>—</span>
      <span className="sr-only">None yet</span>
    </>
  )
}
