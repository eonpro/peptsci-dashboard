import type { LucideIcon } from 'lucide-react'
import { Home, Link2, TrendingUp, UserRound, Wallet } from 'lucide-react'
import {
  isPartnerPrimaryActive,
  partnerPageTitle,
  PARTNER_MOBILE_NAV,
  PARTNER_PRIMARY_NAV,
  type PartnerNavContext,
} from '@/lib/partners/portal'

export type PortalNavContext = PartnerNavContext

export type PrimaryNavItem = {
  name: string
  href: string
  icon: LucideIcon
  exact?: boolean
}

const PRIMARY_ICONS: Record<(typeof PARTNER_PRIMARY_NAV)[number]['name'], LucideIcon> = {
  Home,
  Grow: TrendingUp,
  Earnings: Wallet,
  Account: UserRound,
}

const MOBILE_ICONS: Record<(typeof PARTNER_MOBILE_NAV)[number]['name'], LucideIcon> = {
  Home,
  Links: Link2,
  Earnings: Wallet,
  Account: UserRound,
}

export function visiblePrimaryNav(): PrimaryNavItem[] {
  return PARTNER_PRIMARY_NAV.map((item) => ({
    name: item.name,
    href: item.href,
    exact: item.exact,
    icon: PRIMARY_ICONS[item.name],
  }))
}

export function visibleMobileNav(): PrimaryNavItem[] {
  return PARTNER_MOBILE_NAV.map((item) => ({
    name: item.name,
    href: item.href,
    exact: item.exact,
    icon: MOBILE_ICONS[item.name],
  }))
}

export function isNavItemActive(href: string, pathname: string, exact?: boolean): boolean {
  return isPartnerPrimaryActive(href, pathname, exact)
}

export function pageTitleForPath(pathname: string): string {
  return partnerPageTitle(pathname)
}
