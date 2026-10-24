import { useId, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminOverview, AdminOverviewSkeleton } from '../components/admin/AdminOverview'
import { FormulaManager, FormulaManagerSkeleton } from '../components/admin/FormulaManager'
import { QuestionEditor, QuestionEditorSkeleton } from '../components/admin/QuestionEditor'
import { QuestionImport, QuestionImportSkeleton } from '../components/admin/QuestionImport'
import { QuestionList, QuestionListSkeleton } from '../components/admin/QuestionList'
import { ReportList, ReportListSkeleton } from '../components/admin/ReportList'
import { TaxonomyTree, TaxonomyTreeSkeleton } from '../components/admin/TaxonomyTree'
import { UserList, UserListSkeleton } from '../components/admin/UserList'
import { PageHeader } from '../components/layout/PageHeader'
import { LoadError } from '../components/ui/LoadError'
import { TabPanel, Tabs } from '../components/ui/Tabs'
import { useAdminCatalog } from '../hooks/useAdminCatalog'
import { useAdminQuestions } from '../hooks/useAdminQuestions'

// Loaded lazily from App.tsx, so learners never download the admin code.

type Tab = 'overview' | 'questions' | 'edit' | 'taxonomy' | 'formulas' | 'reports' | 'users'

const TABS: Tab[] = ['overview', 'questions', 'edit', 'taxonomy', 'formulas', 'reports', 'users']

const SKELETONS: Record<Tab, ReactNode> = {
  overview: <AdminOverviewSkeleton />,
  questions: <QuestionListSkeleton />,
  edit: <QuestionEditorSkeleton />,
  taxonomy: <TaxonomyTreeSkeleton />,
  formulas: <FormulaManagerSkeleton />,
  reports: <ReportListSkeleton />,
  users: <UserListSkeleton />,
}

export function Admin() {
  const [params, setParams] = useSearchParams()
  const catalog = useAdminCatalog()
  const questions = useAdminQuestions()
  const tabsId = useId()

  const tab = TABS.find((t) => t === params.get('tab')) ?? 'overview'
  // ?tab=edit adds a question; ?tab=edit&id=<id> edits one.
  const editId = tab === 'edit' ? params.get('id') : null
  // ?tab=questions&view=import imports a CSV file, under the Questions tab.
  const importing = tab === 'questions' && params.get('view') === 'import'
  const editing = editId && questions.status === 'ready' ? questions.data.find((q) => q.id === editId) : undefined
  const openReports =
    questions.status === 'ready' ? questions.data.reduce((total, q) => total + q.open_reports, 0) : 0

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'questions', label: 'Questions' },
    { id: 'edit', label: editId ? (editing ? `Edit ${editing.code}` : 'Edit') : 'New question' },
    { id: 'taxonomy', label: 'Exams & topics' },
    { id: 'formulas', label: 'Formulas' },
    { id: 'reports', label: openReports > 0 ? `Reports (${openReports})` : 'Reports' },
    { id: 'users', label: 'Users' },
  ]

  /** What the tab shows, once the shared data it needs has loaded. */
  function render(): ReactNode {
    // These load their own data.
    if (tab === 'reports') return <ReportList />
    if (tab === 'users') return <UserList />

    if (questions.status === 'error') {
      return <LoadError message={`Couldn't load the questions. ${questions.error}`} onRetry={questions.retry} />
    }
    // The formulas only need the questions, to count the ones using each.
    if (tab === 'formulas') {
      return questions.status === 'loading' ? SKELETONS.formulas : <FormulaManager questions={questions.data} />
    }
    if (catalog.status === 'error') {
      return <LoadError message={`Couldn't load the exams. ${catalog.error}`} onRetry={catalog.retry} />
    }
    if (catalog.status === 'loading' || questions.status === 'loading') {
      return importing ? <QuestionImportSkeleton /> : SKELETONS[tab]
    }
    if (tab === 'overview') return <AdminOverview exams={catalog.data} questions={questions.data} />
    if (importing) return <QuestionImport exams={catalog.data} questions={questions.data} />
    if (tab === 'questions') return <QuestionList exams={catalog.data} questions={questions.data} />
    if (tab === 'taxonomy') return <TaxonomyTree exams={catalog.data} questions={questions.data} />
    return <QuestionEditor exams={catalog.data} questions={questions.data} id={editId} />
  }

  return (
    <>
      <PageHeader
        title="Admin"
        description="Manage questions, exams, topics and formulas, review learners' reports, and manage users."
      />
      <Tabs
        id={tabsId}
        label="Admin"
        tabs={tabs}
        selected={tab}
        onSelect={(t) => {
          // Questions again, from the import, goes back to the list.
          if (t !== tab || importing) setParams({ tab: t }, { replace: true })
        }}
        wrap
      />
      <div className="mt-6">
        {TABS.map((t) => (
          <TabPanel key={t} id={tabsId} tab={t} selected={t === tab}>
            {t === tab && render()}
          </TabPanel>
        ))}
      </div>
    </>
  )
}
