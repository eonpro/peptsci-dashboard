import Link from 'next/link'
import { SHOP_ACCOUNT_LINKS } from '@/lib/shop/portal'
import {
  Receipt,
  LifeBuoy,
  UserRound,
  FileCheck,
  BookOpen,
  Library,
  Gift,
  Store,
} from 'lucide-react'

const ICONS = [Receipt, LifeBuoy, UserRound, FileCheck, BookOpen, Library, Gift, Store]

export function AccountHub() {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-white">Practice shortcuts</h2>
        <p className="text-sm text-white/55">
          Invoices, help, and patients first — storefront and referrals live here so the top nav
          stays simple.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {SHOP_ACCOUNT_LINKS.map((item, i) => {
          const Icon = ICONS[i] ?? BookOpen
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 transition-colors hover:border-brand-primary/40 hover:bg-white/10"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/20 text-brand-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-white">{item.name}</p>
                <p className="mt-0.5 text-sm text-white/50">{item.description}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
