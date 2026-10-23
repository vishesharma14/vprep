import { useId, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminOverview, AdminOverviewSkeleton } from '../components/admin/AdminOverview'
import { QuestionEditor, QuestionEditorSkeleton } from '../components/admin/QuestionEditor'
import { QuestionList, QuestionListSkeleton } from '../components/admin/QuestionList'
import { PageHeader } from '../components/layout/PageHeader'
import { LoadError } from '../components/ui/LoadError'
import { TabPanel, Tabs } from '../components/ui/Tabs'
import { useAdminQuestions } from '../hooks/useAdminQuestions'
import { useExamCatalog } from '../hooks/useExamCatalog'

// Loaded lazily from App.tsx, so learners never download the admin code.

type Tab = 'overview' | 'questions' | 'edit'

const TABS: Tab[] = ['overview', 'questions', 'edit']

const SKELETONS: Record<Tab, ReactNode> = {
  overview: <AdminOverviewSkeleton />,
  questions: <QuestionListSkeleton />,
  edit: <QuestionEditorSkeleton />,
}

export function Admin() {
  const [params, setParams] = useSearchParams()
  const catalog = useExamCatalog()
  const questions = useAdminQuestions()
  const tabsId = useId()

  const tab = TABS.find((t) => t === params.get('tab')) ?? 'overview'
  // ?tab=edit adds a question; ?tab=edit&id=<id> edits one.
  const editId = tab === 'edit' ? params.get('id') : null
  const editing = editId && questions.status === 'ready' ? questions.data.find((q) => q.id === editId) : undefined

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'questions', label: 'Questions' },
    { id: 'edit', label: editId ? (editing ? `Edit ${editing.code}` : 'Edit') : 'New question' },
  ]

  let content: ReactNode
  if (catalog.status === 'error') {
    content = <LoadError message={`Couldn't load the exams. ${catalog.error}`} onRetry={catalog.retry} />
  } else if (questions.status === 'error') {
    content = <LoadError message={`Couldn't load the questions. ${questions.error}`} onRetry={questions.retry} />
  } else if (catalog.status === 'loading' || questions.status === 'loading') {
    content = SKELETONS[tab]
  } else if (tab === 'overview') {
    content = <AdminOverview exams={catalog.data} questions={questions.data} />
  } else if (tab === 'questions') {
    content = <QuestionList exams={catalog.data} questions={questions.data} />
  } else {
    content = <QuestionEditor exams={catalog.data} questions={questions.data} id={editId} />
  }

  return (
    <>
      <PageHeader title="Admin" description="Add and edit questions, and see how learners get on with them." />
      <Tabs
        id={tabsId}
        label="Admin"
        tabs={tabs}
        selected={tab}
        onSelect={(t) => {
          if (t !== tab) setParams({ tab: t }, { replace: true })
        }}
        className="sm:max-w-lg"
      />
      <div className="mt-6">
        {TABS.map((t) => (
          <TabPanel key={t} id={tabsId} tab={t} selected={t === tab}>
            {content}
          </TabPanel>
        ))}
      </div>
    </>
  )
}
