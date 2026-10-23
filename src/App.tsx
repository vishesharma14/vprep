import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { SessionExpiredDialog } from './auth/SessionExpiredDialog'
import { AppShell } from './components/layout/AppShell'
import { ErrorBoundary, RouteCrashed } from './components/layout/ErrorBoundary'
import { PageHeader } from './components/layout/PageHeader'
import { LoadError } from './components/ui/LoadError'
import { LoadingLabel, Skeleton } from './components/ui/Skeleton'
import { Home } from './pages/Home'

/**
 * A page whose code is downloaded the first time it is opened, so a first
 * visit only loads Home. `title` is the page's heading, shown while the code
 * downloads; leave it out for pages whose heading isn't fixed. If the download
 * fails (offline, or a new deploy replaced the file), Retry reloads the app.
 */
function lazyPage(load: () => Promise<ComponentType>, title?: string) {
  const Page = lazy(() =>
    load().then(
      (Component) => ({ default: Component }),
      (): { default: ComponentType } => ({ default: () => <PageLoadFailed title={title} /> }),
    ),
  )
  return function LazyPage() {
    return (
      <Suspense fallback={<PageLoading title={title} />}>
        <Page />
      </Suspense>
    )
  }
}

function PageLoading({ title }: { title?: string }) {
  return (
    <>
      {title ? <PageHeader title={title} /> : <Skeleton className="mb-6 h-9 w-56 max-w-full md:h-10" />}
      <LoadingLabel>Loading the page…</LoadingLabel>
      <Skeleton className="h-11 sm:max-w-lg" />
      <Skeleton className="mt-6 h-64" />
    </>
  )
}

function PageLoadFailed({ title }: { title?: string }) {
  return (
    <>
      {title && <PageHeader title={title} />}
      <LoadError
        message="Couldn't load this page. Check your internet connection and try again."
        onRetry={() => window.location.reload()}
      />
    </>
  )
}

const Account = lazyPage(() => import('./pages/Account').then((m) => m.Account), 'Account')
// Admins only, so learners never download it.
const Admin = lazyPage(() => import('./pages/Admin').then((m) => m.Admin), 'Admin')
const ExamDetail = lazyPage(() => import('./pages/ExamDetail').then((m) => m.ExamDetail))
const Exams = lazyPage(() => import('./pages/Exams').then((m) => m.Exams), 'Exams')
const Formulas = lazyPage(() => import('./pages/Formulas').then((m) => m.Formulas), 'Formulas')
const Leaderboard = lazyPage(() => import('./pages/Leaderboard').then((m) => m.Leaderboard), 'Leaderboard')
const NotFound = lazyPage(() => import('./pages/NotFound').then((m) => m.NotFound), 'Page not found')
const Practice = lazyPage(() => import('./pages/Practice').then((m) => m.Practice))
const Progress = lazyPage(() => import('./pages/Progress').then((m) => m.Progress), 'Progress')
const Result = lazyPage(() => import('./pages/Result').then((m) => m.Result), 'Result')
const Revision = lazyPage(() => import('./pages/Revision').then((m) => m.Revision), 'Revision')
const Search = lazyPage(() => import('./pages/Search').then((m) => m.Search), 'Search')
const TimedTest = lazyPage(() => import('./pages/TimedTest').then((m) => m.TimedTest))

const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteCrashed />,
    children: [
      { index: true, element: <Home /> },
      { path: 'exams', element: <Exams /> },
      { path: 'exams/:slug', element: <ExamDetail /> },
      { path: 'practice', element: <Practice /> },
      { path: 'test', element: <TimedTest /> },
      { path: 'result', element: <Result /> },
      {
        path: 'revision',
        element: (
          <RequireAuth title="Revision" signInMessage="Sign in to see your revision">
            <Revision />
          </RequireAuth>
        ),
      },
      { path: 'formulas', element: <Formulas /> },
      {
        path: 'progress',
        element: (
          <RequireAuth title="Progress" signInMessage="Sign in to see your progress">
            <Progress />
          </RequireAuth>
        ),
      },
      { path: 'leaderboard', element: <Leaderboard /> },
      { path: 'search', element: <Search /> },
      {
        path: 'admin',
        element: (
          <RequireAuth title="Admin" admin>
            <Admin />
          </RequireAuth>
        ),
      },
      { path: 'account', element: <Account /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <RouterProvider router={router} />
        <SessionExpiredDialog />
      </AuthProvider>
    </ErrorBoundary>
  )
}
