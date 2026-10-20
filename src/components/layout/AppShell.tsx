import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { cx } from '../../lib/cx'
import { Bubble } from '../ui/Bubble'
import { navGroups, navItems, type NavItem } from './nav'

const tabItems = navItems.filter((item) => item.tab)
const moreItems = navItems.filter((item) => !item.tab)

/** Sidebar on desktop (md+), top bar + bottom tab bar on mobile. */
export function AppShell() {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <Sidebar />
      <div className="flex min-w-0 flex-col">
        <MobileHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 md:px-10 md:pt-10 md:pb-12">
          <Outlet />
        </main>
      </div>
      <TabBar />
    </div>
  )
}

function Brand({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      aria-label="vprep home"
      className={cx('flex items-center gap-1 font-display text-xl font-bold tracking-tight', className)}
    >
      <Bubble label="v" state="filled" />
      <span>prep</span>
    </Link>
  )
}

function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col gap-8 border-r border-ink/10 bg-sheet px-4 py-6 md:flex">
      <Brand className="px-3" />
      <nav aria-label="Main" className="flex flex-col gap-6 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group}>
            <p className="px-3 pb-2 font-mono text-[0.6875rem] font-medium uppercase tracking-widest text-drop">
              {group}
            </p>
            <ul className="flex flex-col gap-0.5">
              {navItems
                .filter((item) => item.group === group)
                .map((item) => (
                  <li key={item.to}>
                    <SidebarLink item={item} />
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}

function SidebarLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cx(
          'group flex items-center gap-3 rounded-md px-3 py-2 transition-colors',
          isActive ? 'bg-pen/10 font-bold text-pen' : 'text-ink/75 hover:bg-ink/5 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Bubble size="sm" state={isActive ? 'filled' : 'empty'} />
          {item.label}
        </>
      )}
    </NavLink>
  )
}

function MobileHeader() {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-ink/10 bg-paper/90 px-4 backdrop-blur md:hidden">
      <Brand />
      <NavLink
        to="/search"
        className={({ isActive }) =>
          cx('font-mono text-xs uppercase tracking-wider', isActive ? 'text-pen' : 'text-ink/70')
        }
      >
        Search
      </NavLink>
    </header>
  )
}

const tabClass = (active: boolean) =>
  cx(
    'group flex w-full flex-col items-center gap-1.5 py-2.5 font-mono text-[0.6875rem] uppercase tracking-wider',
    active ? 'text-pen' : 'text-ink/60',
  )

function TabBar() {
  const [moreOpen, setMoreOpen] = useState(false)
  const { pathname } = useLocation()
  const moreActive = moreItems.some(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  )
  const close = () => setMoreOpen(false)

  return (
    <>
      {moreOpen && <div aria-hidden className="fixed inset-0 z-20 bg-ink/20 md:hidden" onClick={close} />}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-sheet pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul id="more-menu" hidden={!moreOpen} className="grid grid-cols-2 gap-1 border-b border-ink/10 p-3">
          {moreItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={close}
                className={({ isActive }) =>
                  cx(
                    'block rounded-md px-3 py-2.5',
                    isActive ? 'bg-pen/10 font-bold text-pen' : 'text-ink/80 hover:bg-ink/5',
                  )
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <ul className="grid grid-cols-5">
          {tabItems.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.to === '/'} onClick={close} className={({ isActive }) => tabClass(isActive)}>
                {({ isActive }) => (
                  <>
                    <Bubble size="sm" state={isActive ? 'filled' : 'empty'} />
                    {item.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li>
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-controls="more-menu"
              onClick={() => setMoreOpen((open) => !open)}
              className={tabClass(moreOpen || moreActive)}
            >
              <Bubble size="sm" state={moreOpen || moreActive ? 'filled' : 'empty'} />
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  )
}
