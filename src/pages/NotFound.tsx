import { useLocation } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { ButtonLink } from '../components/ui/Button'

export function NotFound() {
  const { pathname } = useLocation()

  return (
    <>
      <PageHeader
        title="Page not found"
        description={
          <>
            There's no page at <span className="break-all font-mono text-ink">{pathname}</span>. The link may be
            wrong or out of date.
          </>
        }
      />
      <div className="flex flex-wrap gap-3">
        <ButtonLink to="/">Go to Home</ButtonLink>
        <ButtonLink to="/exams" variant="secondary">
          Browse exams
        </ButtonLink>
      </div>
    </>
  )
}
