import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { RegionSelect } from '../components/account/RegionSelect'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { LoadError } from '../components/ui/LoadError'
import { Notice } from '../components/ui/Notice'
import { LoadingLabel, Skeleton } from '../components/ui/Skeleton'
import { TabPanel, Tabs } from '../components/ui/Tabs'
import { GLOBAL_SCOPE, notListedMessage, useLeaderboard, type LeaderboardScope } from '../hooks/useLeaderboard'
import { useMyProgress } from '../hooks/useMyProgress'
import { cx } from '../lib/cx'
import { ATTEMPT_POINTS, type LeaderboardRow } from '../types'

type Scope = 'global' | 'country' | 'state'

/** profiles.country defaults to this; signed-out visitors see it too. */
const DEFAULT_COUNTRY = 'India'

const DESCRIPTION =
  'Points reward how you solve, counting your best attempt on each question: ' +
  `${ATTEMPT_POINTS.independent} solved independently, ${ATTEMPT_POINTS.hint} after a hint, ` +
  `${ATTEMPT_POINTS.revealed} after viewing the answer.`

// The page is public, so get_leaderboard() returns only these short names.
const NAMES_NOTE = 'Names are shown as first name and last initial.'

const labelClass = 'font-mono text-[0.6875rem] font-medium uppercase tracking-widest text-drop'

// The outer cells line up with the card's padding.
const cellClass = 'px-3 py-3 first:pl-5 last:pr-5'

const SKELETON_ROWS = 8

export function Leaderboard() {
  const { status } = useAuth()
  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Leaderboard"
        description={
          <>
            {DESCRIPTION}
            <span className="mt-1 block">{NAMES_NOTE}</span>
          </>
        }
      />
      {/* Which tabs show depends on the session, so wait for it. */}
      {status === 'loading' ? (
        <>
          <Skeleton className="h-11 sm:max-w-lg" />
          <div className="mt-6">
            <RankingSkeleton />
          </div>
        </>
      ) : (
        <Rankings />
      )}
    </div>
  )
}

function Rankings() {
  const auth = useAuth()
  const [params, setParams] = useSearchParams()
  const tabsId = useId()
  const signedIn = auth.status === 'signed-in'
  const userId = auth.user?.id ?? null
  const country = auth.profile?.country ?? DEFAULT_COUNTRY
  const state = auth.profile?.state ?? null

  // Signed out, ?scope=state falls back to Global.
  const requested = params.get('scope')
  const scope: Scope = requested === 'country' || (requested === 'state' && signedIn) ? requested : 'global'

  const tabs: Array<{ id: Scope; label: ReactNode }> = [
    { id: 'global', label: 'Global' },
    { id: 'country', label: country },
  ]
  if (signedIn) {
    tabs.push({
      id: 'state',
      // Some state names are too long for a third of a phone screen.
      label: (
        <span className="block truncate" title={state ?? undefined}>
          {state ?? 'Your state'}
        </span>
      ),
    })
  }

  const statePanelId = `${tabsId}-panel-state`
  // The form is replaced by the ranking: keep focus in the panel.
  const onStateSaved = () => requestAnimationFrame(() => document.getElementById(statePanelId)?.focus())

  return (
    <>
      <Tabs
        id={tabsId}
        label="Leaderboard"
        tabs={tabs}
        selected={scope}
        onSelect={(t) => setParams(t === 'global' ? {} : { scope: t }, { replace: true })}
        className="sm:max-w-lg"
      />
      <div className="mt-6">
        <TabPanel id={tabsId} tab="global" selected={scope === 'global'}>
          <Ranking scope={GLOBAL_SCOPE} place={null} userId={userId} />
        </TabPanel>
        <TabPanel id={tabsId} tab="country" selected={scope === 'country'}>
          <Ranking key={country} scope={{ country, state: null }} place={country} userId={userId} />
        </TabPanel>
        {signedIn && (
          <TabPanel id={tabsId} tab="state" selected={scope === 'state'}>
            {!auth.profile ? (
              <LoadError
                message={`Couldn't load your profile. ${auth.profileError ?? ''}`}
                onRetry={() => void auth.refreshProfile()}
              />
            ) : state ? (
              <Ranking key={state} scope={{ country: null, state }} place={state} userId={userId} />
            ) : (
              <StatePicker onSaved={onStateSaved} />
            )}
          </TabPanel>
        )}
      </div>
    </>
  )
}

/** One leaderboard: `place` names the country or state, null for Global. */
function Ranking({ scope, place, userId }: { scope: LeaderboardScope; place: string | null; userId: string | null }) {
  const board = useLeaderboard(scope)

  if (board.status === 'error') {
    return <LoadError message={`Couldn't load the leaderboard. ${board.error}`} onRetry={board.retry} />
  }
  if (board.status === 'loading') return <RankingSkeleton />

  const rows = board.data

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <NoLearners place={place} />
      ) : (
        <RankingTable rows={rows} caption={place ? `Leaderboard for ${place}` : 'Global leaderboard'} />
      )}
      {userId !== null && !rows.some((row) => row.is_me) && <NotListed userId={userId} />}
    </div>
  )
}

/** Under a ranking that leaves out the signed-in learner: why. */
function NotListed({ userId }: { userId: string }) {
  const progress = useMyProgress(userId)
  // Only a hint, so nothing shows until my_progress has loaded.
  if (progress.status !== 'ready') return null
  return <p className="text-sm text-ink/70">{notListedMessage(progress.data.totals)}</p>
}

function RankingTable({ rows, caption }: { rows: LeaderboardRow[]; caption: string }) {
  const captionId = useId()
  return (
    <Card className="px-0 py-2">
      {/* Scrolls sideways on narrow screens; focusable so the keyboard can scroll it too. */}
      <div
        role="region"
        aria-labelledby={captionId}
        tabIndex={0}
        className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
      >
        <table className="w-full min-w-[30rem] text-sm">
          <caption id={captionId} className="sr-only">
            {caption}
          </caption>
          <thead>
            <tr className={labelClass}>
              <th scope="col" className={cx(cellClass, 'w-20 text-right font-medium')}>
                Rank
              </th>
              <th scope="col" className={cx(cellClass, 'text-left font-medium')}>
                Learner
              </th>
              <th scope="col" className={cx(cellClass, 'text-left font-medium')}>
                State
              </th>
              <th scope="col" className={cx(cellClass, 'text-right font-medium')}>
                Points
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Rows have no id and ties share a rank; a new ranking replaces them all. */}
            {rows.map((row, i) => (
              <RankingRow key={i} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function RankingRow({ row }: { row: LeaderboardRow }) {
  const you = row.is_me
  return (
    <tr className={cx('border-t border-ink/10', you && 'bg-pen/5')}>
      <td className={cx(cellClass, 'text-right font-mono', you && 'shadow-[inset_3px_0_0_var(--color-pen)]')}>
        <RankBadge rank={row.rank} />
      </td>
      <th scope="row" className={cx(cellClass, 'text-left font-normal')}>
        <span className="break-words font-bold">{row.display_name}</span>
        {you && <span className="text-pen"> (you)</span>}
      </th>
      <td className={cx(cellClass, 'text-ink/70')}>
        {row.state ?? (
          <>
            <span aria-hidden>—</span>
            <span className="sr-only">Not given</span>
          </>
        )}
      </td>
      <td className={cx(cellClass, 'text-right font-mono font-medium tabular-nums')}>{row.points}</td>
    </tr>
  )
}

/** The rank, tinted for the top three (ties included). */
function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={cx(
        'inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 tabular-nums',
        rank <= 3 && 'bg-drop/10 font-bold text-drop',
      )}
    >
      {rank}
    </span>
  )
}

function NoLearners({ place }: { place: string | null }) {
  return (
    <Card className="flex max-w-md flex-col items-start gap-4">
      <p>{place ? `No learners from ${place} on the leaderboard yet.` : 'No learners on the leaderboard yet.'}</p>
      <ButtonLink to="/exams">Browse exams</ButtonLink>
    </Card>
  )
}

/** Signed in with no state saved: pick one, save it to the profile, then the ranking loads. */
function StatePicker({ onSaved }: { onSaved: () => void }) {
  const { updateProfile } = useAuth()
  const [region, setRegion] = useState('')
  const [error, setError] = useState<string>()
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setFormError(null)
    if (!region) {
      setError('Choose your state or union territory.')
      requestAnimationFrame(() => form.querySelector('select')?.focus())
      return
    }

    setSaving(true)
    try {
      // On success the profile has a state, and this form gives way to the ranking.
      await updateProfile({ state: region })
      onSaved()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  return (
    <Card className="flex max-w-md flex-col gap-4">
      <p>Choose your state to see how you rank there. You can change it later on your account page.</p>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        {formError && <Notice tone="bad">{formError}</Notice>}
        <RegionSelect
          value={region}
          onChange={(e) => {
            setRegion(e.target.value)
            setError(undefined)
          }}
          placeholder="Choose…"
          error={error}
        />
        <Button type="submit" disabled={saving} className="self-start">
          {saving ? 'Saving…' : 'Show my state'}
        </Button>
      </form>
    </Card>
  )
}

function RankingSkeleton() {
  return (
    <>
      <LoadingLabel>Loading the leaderboard…</LoadingLabel>
      <Card className="px-0 py-2">
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-t border-ink/10 px-5 py-3 first:border-t-0">
            <Skeleton circle className="size-7 shrink-0" />
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="ml-auto h-4 w-10 shrink-0" />
          </div>
        ))}
      </Card>
    </>
  )
}
