import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { Account } from './pages/Account'
import { Admin } from './pages/Admin'
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

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'exams', element: <Exams /> },
      { path: 'exams/:examId', element: <ExamDetail /> },
      { path: 'practice', element: <Practice /> },
      { path: 'test', element: <TimedTest /> },
      { path: 'result', element: <Result /> },
      { path: 'revision', element: <Revision /> },
      { path: 'formulas', element: <Formulas /> },
      { path: 'progress', element: <Progress /> },
      { path: 'leaderboard', element: <Leaderboard /> },
      { path: 'search', element: <Search /> },
      { path: 'admin', element: <Admin /> },
      { path: 'account', element: <Account /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
