import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { SessionExpiredDialog } from './auth/SessionExpiredDialog'
import { AppShell } from './components/layout/AppShell'
import { PageHeader } from './components/layout/PageHeader'
import { LoadError } from './components/ui/LoadError'
import { LoadingLabel, Skeleton } from './components/ui/Skeleton'
import { Account } from './pages/Account'
import { ExamDetail } from './pages/ExamDetail'
import { Exams } from './pages/Exams'
import { Formulas } from './pages/Formulas'
import { Home } from './pages/Home'
import { Leaderboard } from './pages/Leaderboard'
import { Practice } from './pages/Practice'
import { Progress } from './pages/Progress'
import { Result } from './pages/Result'
import { Revision } from './pages/Revision'
import { Search } from './pages/Search'
import { TimedTest } from './pages/TimedTest'

// Admins only, so it is downloaded the first time an admin opens it, never by
// learners. If the download fails, Retry reloads the page to try again.
const Admin = lazy(() =>
  import('./pages/Admin').then(
    (module) => ({ default: module.Admin }),
    () => ({ default: AdminLoadFailed }),
  ),
)

function AdminLoading() {
  return (
    <>
      <PageHeader title="Admin" />
      <LoadingLabel>Loading the admin panel…</LoadingLabel>
      <Skeleton className="h-11 sm:max-w-lg" />
      <Skeleton className="mt-6 h-64" />
    </>
  )
}

function AdminLoadFailed() {
  return (
    <>
      <PageHeader title="Admin" />
      <LoadError
        message="Couldn't load the admin panel. Check your internet connection and try again."
        onRetry={() => window.location.reload()}
      />
    </>
  )
}

const router = createBrowserRouter([
  {
    element: <AppShell />,
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
            <Suspense fallback={<AdminLoading />}>
              <Admin />
            </Suspense>
          </RequireAuth>
        ),
      },
      { path: 'account', element: <Account /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <SessionExpiredDialog />
    </AuthProvider>
  )
}
