import type { LucideIcon } from 'lucide-react'
import {
  Banknote,
  Building2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  KeyRound,
  LayoutDashboard,
  Link2,
  Receipt,
  Settings,
  Tags,
  Target,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-react'

export interface PortalNavItem {
  name: string
  href: string
  icon: LucideIcon
  orgOnly?: boolean
  marginOnly?: boolean
  adminOnly?: boolean
}

export interface PortalNavSection {
  label: string | null
  items: PortalNavItem[]
}

export interface PortalNavContext {
  kind: 'ORG' | 'REP'
  role: 'OWNER' | 'ADMIN' | 'VIEWER' | null
  marginModel: boolean
}

const SECTIONS: PortalNavSection[] = [
  {
    label: null,
    items: [{ name: 'Dashboard', href: '/partners', icon: LayoutDashboard }],
  },
  {
    label: 'Grow',
    items: [
      { name: 'Leads', href: '/partners/leads', icon: UserPlus },
      { name: 'Clinics', href: '/partners/clinics', icon: Building2 },
      { name: 'Links', href: '/partners/links', icon: Link2 },
      { name: 'Quotes', href: '/partners/quotes', icon: FileText },
      { name: 'Goals', href: '/partners/goals', icon: Target },
    ],
  },
  {
    label: 'Earnings',
    items: [
      { name: 'Transactions', href: '/partners/transactions', icon: Receipt },
      { name: 'Statements', href: '/partners/statements', icon: FileSpreadsheet },
      { name: 'Payouts', href: '/partners/payouts', icon: Banknote },
      { name: 'Pricing', href: '/partners/pricing', icon: Tags, orgOnly: true, marginOnly: true },
    ],
  },
  {
    label: 'Resources',
    items: [{ name: 'Assets', href: '/partners/assets', icon: FolderOpen }],
  },
  {
    label: 'Organization',
    items: [
      { name: 'Reps', href: '/partners/reps', icon: Users, orgOnly: true },
      { name: 'Team', href: '/partners/team', icon: UserCog, orgOnly: true, adminOnly: true },
      { name: 'API', href: '/partners/api', icon: KeyRound, orgOnly: true, adminOnly: true },
    ],
  },
  {
    label: 'Settings',
    items: [{ name: 'Terms & settings', href: '/partners/terms', icon: Settings }],
  },
]

/** Nav sections visible for the given partner context (same gating rules as the old tab nav). */
export function visibleSections(ctx: PortalNavContext): PortalNavSection[] {
  return SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.orgOnly && ctx.kind !== 'ORG') return false
      if (item.marginOnly && !ctx.marginModel) return false
      if (item.adminOnly && ctx.role === 'VIEWER') return false
      return true
    }),
  })).filter((section) => section.items.length > 0)
}

export function isNavItemActive(href: string, pathname: string): boolean {
  return href === '/partners' ? pathname === '/partners' : pathname.startsWith(href)
}

/** Page title for the topbar, derived from the longest matching nav href. */
export function pageTitleForPath(pathname: string): string {
  let best: PortalNavItem | null = null
  for (const section of SECTIONS) {
    for (const item of section.items) {
      if (isNavItemActive(item.href, pathname)) {
        if (!best || item.href.length > best.href.length) best = item
      }
    }
  }
  return best?.name ?? 'Partners'
}
