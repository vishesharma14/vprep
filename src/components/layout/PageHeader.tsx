export function PageHeader({ title }: { title: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
    </header>
  )
}
