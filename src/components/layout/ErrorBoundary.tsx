import { Component, type ReactNode } from 'react'
import { useRouteError } from 'react-router-dom'
import { Button } from '../ui/Button'

/**
 * Full-page message for an error nothing else handled, instead of a blank
 * page. Rendered outside the router, so it uses plain links.
 */
function AppCrashed({ error }: { error: unknown }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Something went wrong</h1>
      <p className="text-ink/70">VPrep hit an unexpected error. Reloading the page usually fixes it.</p>
      {import.meta.env.DEV && (
        <pre className="overflow-x-auto rounded-lg bg-bad/10 px-3 py-2 font-mono text-xs text-bad">
          {error instanceof Error ? error.message : String(error)}
        </pre>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={() => window.location.reload()}>Reload</Button>
        <a href="/" className="font-bold text-pen hover:underline">
          Go to Home
        </a>
      </div>
    </main>
  )
}

/** The router's errorElement: React Router catches errors in pages before ErrorBoundary would. */
export function RouteCrashed() {
  return <AppCrashed error={useRouteError()} />
}

/** Catches errors outside the router, such as in AuthProvider. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean; error: unknown }> {
  state = { crashed: false, error: undefined as unknown }

  // React logs the error to the console itself.
  static getDerivedStateFromError(error: unknown) {
    return { crashed: true, error }
  }

  render() {
    return this.state.crashed ? <AppCrashed error={this.state.error} /> : this.props.children
  }
}
