export type NavGroup = 'Study' | 'Track' | 'Manage'

export interface NavItem {
  to: string
  label: string
  group: NavGroup
  /** Shown in the mobile bottom tab bar; everything else goes under "More". */
  tab?: boolean
}

export const navGroups: NavGroup[] = ['Study', 'Track', 'Manage']

// Exam detail and Result are reached from other pages, so they are not listed.
export const navItems: NavItem[] = [
  { to: '/', label: 'Home', group: 'Study', tab: true },
  { to: '/search', label: 'Search', group: 'Study' },
  { to: '/exams', label: 'Exams', group: 'Study', tab: true },
  { to: '/practice', label: 'Practice', group: 'Study' },
  { to: '/test', label: 'Timed test', group: 'Study' },
  { to: '/revision', label: 'Revision', group: 'Study', tab: true },
  { to: '/formulas', label: 'Formulas', group: 'Study' },
  { to: '/progress', label: 'Progress', group: 'Track', tab: true },
  { to: '/leaderboard', label: 'Leaderboard', group: 'Track' },
  { to: '/account', label: 'Account', group: 'Manage' },
  { to: '/admin', label: 'Admin', group: 'Manage' },
]
