import { useRef, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { useAsync } from '../../hooks/useAsync'
import { adminRejected, adminWrite } from '../../lib/admin'
import { cx } from '../../lib/cx'
import { dbErrorMessage, SESSION_EXPIRED } from '../../lib/errors'
import { formatDate, plural } from '../../lib/format'
import { neon } from '../../lib/neon'
import { matchesEveryWord, searchWords } from '../../lib/search'
import { withSessionRecovery } from '../../lib/session'
import type { AdminUserRow, Profile } from '../../types'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { TextField } from '../ui/Field'
import { LoadError } from '../ui/LoadError'
import { Notice } from '../ui/Notice'
import { LoadingLabel, Skeleton } from '../ui/Skeleton'
import { Tag } from '../ui/Tag'
import { ScrollTable } from './ScrollTable'
import { Pill } from './StatusPill'
import { cellClass, headClass, labelClass, pinnedClass, pinnedHeadClass } from './table'

type Access = Pick<Profile, 'role' | 'is_suspended'>

async function fetchUsers() {
  const { data, error, status, expired } = await withSessionRecovery(() => neon.rpc('admin_users'), adminRejected)
  if (error) throw new Error(expired ? SESSION_EXPIRED : dbErrorMessage(error, status))
  return data as AdminUserRow[]
}

/** Saves another learner's role or suspension. Resolves to what was saved, or an error message. */
async function saveAccess(id: string, changes: Partial<Access>) {
  const result = await adminWrite<Access>(() =>
    neon.from('profiles').update(changes).eq('id', id).select('role, is_suspended'),
  )
  if (result.error !== undefined) return { error: result.error }
  const access = result.rows[0]
  if (!access) return { error: "Couldn't find this learner. Reload the page and try again." }
  return { access }
}

/** Every learner (admin_users), with search and the actions to suspend them or make them admins. */
export function UserList() {
  const users = useAsync(fetchUsers)
  if (users.status === 'error') {
    return <LoadError message={`Couldn't load the users. ${users.error}`} onRetry={users.retry} />
  }
  if (users.status === 'loading') return <UserListSkeleton />
  return <UserBoard initial={users.data} />
}

function UserBoard({ initial }: { initial: AdminUserRow[] }) {
  const { profile } = useAuth()
  const [users, setUsers] = useState(initial)
  const [text, setText] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const words = searchWords(text)
  const shown = users.filter((u) => matchesEveryWord([u.full_name, u.email], words))

  function onSaved(id: string, access: Access, message: string) {
    setUsers((list) => list.map((u) => (u.id === id ? { ...u, ...access } : u)))
    setNotice(message)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="sm:max-w-md">
        <TextField
          label="Find"
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Name or email"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {notice && <Notice tone="ok">{notice}</Notice>}

      <p role="status" className="text-sm text-ink/70">
        {words.length > 0 ? `Showing ${shown.length} of ${plural(users.length, 'user')}` : plural(users.length, 'user')}
      </p>

      {shown.length === 0 ? (
        <Card>
          <p className="break-words text-ink/70">
            {users.length === 0 ? 'No users yet.' : `No users match "${text.trim()}". Try part of a name or email.`}
          </p>
        </Card>
      ) : (
        <ScrollTable caption="Users" className="min-w-[56rem]">
          <thead>
            <tr className={labelClass}>
              <th scope="col" className={cx(headClass, 'text-left')}>
                Name
              </th>
              <th scope="col" className={cx(headClass, 'text-left')}>
                Email
              </th>
              <th scope="col" className={cx(headClass, 'text-left')}>
                State
              </th>
              <th scope="col" className={cx(headClass, 'text-right')}>
                Attempts
              </th>
              <th scope="col" className={cx(headClass, 'text-right')}>
                Points
              </th>
              <th scope="col" className={cx(headClass, 'text-left')}>
                Last active
              </th>
              <th scope="col" className={cx(headClass, 'text-left')}>
                Status
              </th>
              <th scope="col" className={cx(pinnedHeadClass, 'text-right')}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((user) => (
              <UserRow key={user.id} user={user} you={user.id === profile?.id} onSaved={onSaved} />
            ))}
          </tbody>
        </ScrollTable>
      )}
    </div>
  )
}

/** One of the two buttons in a row: suspension, or admin access. */
type Slot = 'suspension' | 'role'

interface UserAction {
  slot: Slot
  label: string
  changes: Partial<Access>
  /** Asked before saving. */
  question: string
  /** Said once saved. */
  done: string
  /** Takes something away, so confirmed with a danger button. */
  danger: boolean
}

function actionsFor(user: AdminUserRow): UserAction[] {
  const name = user.full_name
  const admin = user.role === 'admin'
  return [
    user.is_suspended
      ? {
          slot: 'suspension',
          label: 'Reinstate',
          changes: { is_suspended: false },
          question: `Reinstate ${name}? They can save attempts and reports again, and come back to the leaderboard.`,
          done: `${name} is reinstated.`,
          danger: false,
        }
      : {
          slot: 'suspension',
          label: 'Suspend',
          changes: { is_suspended: true },
          question:
            `Suspend ${name}? They can still sign in, but can't save attempts or reports, and they leave the leaderboard.` +
            (admin ? ' Their admin access stops too.' : ''),
          done: `${name} is suspended.`,
          danger: true,
        },
    admin
      ? {
          slot: 'role',
          label: 'Remove admin',
          changes: { role: 'learner' },
          question: `Remove ${name}'s admin access? They become a learner.`,
          done: `${name} is no longer an admin.`,
          danger: true,
        }
      : {
          slot: 'role',
          label: 'Make admin',
          changes: { role: 'admin' },
          question: `Make ${name} an admin? They can change all content, reports and users.`,
          done: `${name} is now an admin.`,
          danger: false,
        },
  ]
}

type RowState =
  | { kind: 'idle' }
  | { kind: 'confirm'; action: UserAction }
  | { kind: 'busy'; action: UserAction }
  | { kind: 'error'; action: UserAction; message: string }

const dash = (label: string) => (
  <>
    <span aria-hidden>—</span>
    <span className="sr-only">{label}</span>
  </>
)

interface UserRowProps {
  user: AdminUserRow
  /** The signed-in admin's own row, which has no actions. */
  you: boolean
  onSaved: (id: string, access: Access, message: string) => void
}

function UserRow({ user, you, onSaved }: UserRowProps) {
  const [row, setRow] = useState<RowState>({ kind: 'idle' })
  const actionsRef = useRef<HTMLDivElement>(null)

  /** Puts focus back on a slot's button once React has rendered it. */
  const focusSlot = (slot: Slot) =>
    requestAnimationFrame(() => actionsRef.current?.querySelector<HTMLElement>(`[data-slot="${slot}"]`)?.focus())

  function cancel(slot: Slot) {
    setRow({ kind: 'idle' })
    focusSlot(slot)
  }

  async function save(action: UserAction) {
    setRow({ kind: 'busy', action })
    const result = await saveAccess(user.id, action.changes)
    if (result.error !== undefined) return setRow({ kind: 'error', action, message: result.error })
    onSaved(user.id, result.access, action.done)
    // The button now offers the opposite, e.g. Reinstate after Suspend.
    cancel(action.slot)
  }

  return (
    <tr className="border-t border-ink/10">
      <th scope="row" className={cx(cellClass, 'min-w-40 text-left font-normal')}>
        <span className="break-words font-bold">{user.full_name}</span>
        {you && <span className="text-pen"> (you)</span>}
      </th>
      <td className={cx(cellClass, 'min-w-48 break-all text-ink/70')}>{user.email}</td>
      <td className={cx(cellClass, 'min-w-32')}>{user.state ?? dash('Not given')}</td>
      <td className={cx(cellClass, 'text-right font-mono tabular-nums')}>{user.attempts}</td>
      <td className={cx(cellClass, 'text-right font-mono tabular-nums')}>{user.points}</td>
      <td className={cx(cellClass, 'whitespace-nowrap')}>
        {user.last_active ? (
          <time dateTime={user.last_active}>{formatDate(user.last_active)}</time>
        ) : (
          dash('No attempts yet')
        )}
      </td>
      <td className={cellClass}>
        <div className="flex flex-wrap items-center gap-1.5">
          {user.is_suspended ? <Pill tone="bad">Suspended</Pill> : <Pill tone="ok">Active</Pill>}
          {user.role === 'admin' && <Tag>Admin</Tag>}
        </div>
      </td>
      {/* Pinned, so the actions stay in view however far the table scrolls. */}
      <td className={cx(cellClass, pinnedClass, 'bg-sheet text-right')}>
        <div ref={actionsRef}>
          {you ? (
            <p className="text-xs text-ink/60">Your account</p>
          ) : row.kind === 'confirm' ? (
            <div
              role="group"
              aria-label={`${row.action.label} ${user.full_name}?`}
              className="ml-auto flex w-44 flex-col items-end gap-2 sm:w-64"
            >
              <p className="text-left">{row.action.question}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" autoFocus onClick={() => cancel(row.action.slot)}>
                  Cancel
                </Button>
                <Button size="sm" variant={row.action.danger ? 'danger' : 'primary'} onClick={() => save(row.action)}>
                  {row.action.label}
                </Button>
              </div>
            </div>
          ) : row.kind === 'error' ? (
            <div className="ml-auto flex w-44 flex-col items-end gap-2 sm:w-64">
              <p role="alert" className="text-left text-bad">
                {row.message}
              </p>
              <Button size="sm" variant="secondary" autoFocus onClick={() => cancel(row.action.slot)}>
                Dismiss
              </Button>
            </div>
          ) : (
            // Stacked on narrow screens, so the pinned column leaves room for the rest.
            <div className="ml-auto flex w-28 flex-col gap-1 sm:w-auto sm:items-end">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:justify-end">
                {actionsFor(user).map((action) => (
                  <Button
                    key={action.slot}
                    size="sm"
                    variant={action.danger ? 'ghost' : 'secondary'}
                    data-slot={action.slot}
                    disabled={row.kind === 'busy'}
                    aria-label={`${action.label} ${user.full_name}`}
                    className="whitespace-nowrap"
                    onClick={() => setRow({ kind: 'confirm', action })}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
              {row.kind === 'busy' && (
                <p role="status" className="text-xs text-ink/60">
                  Saving…
                </p>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

export function UserListSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <LoadingLabel>Loading the users…</LoadingLabel>
      <div className="flex flex-col gap-1.5 sm:max-w-md">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-11" />
      </div>
      <Skeleton className="h-4 w-24" />
      <Card className="px-0 py-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-t border-ink/10 px-5 py-3 first:border-t-0">
            <Skeleton className="h-4 w-32 shrink-0" />
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="ml-auto h-8 w-40 shrink-0" />
          </div>
        ))}
      </Card>
    </div>
  )
}
