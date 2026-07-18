import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPartnerContext } from '@/lib/partners/auth'
import { Button } from '@/components/ui/button'
import { PortalNav } from './PortalNav'

export const dynamic = 'force-dynamic'

/**
 * Partner portal shell. Resolves the partner identity (org owner / member /
 * rep) once per request; anonymous or non-partner sessions see the no-access
 * screen, and unsigned org owners / reps are gated to the MSA page
 * (/partners/agreement lives outside this group so it stays reachable).
 */
export default async function PartnerPortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getPartnerContext()

  if (!ctx) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-brand-onyx px-6 text-center text-white">
        <h1 className="text-2xl font-bold">Partner portal</h1>
        <p className="mt-3 max-w-md text-white/70">
          This account doesn&rsquo;t have partner access. If your organization was approved,
          accept the sign-up invitation email first — or apply to the program below.
        </p>
        <div className="mt-6 flex gap-3">
          <Button asChild className="font-semibold">
            <Link href="/partners/apply">Apply to the program</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-white/20 bg-transparent font-semibold text-white hover:bg-white/10 hover:text-white"
          >
            <Link href="/">Back home</Link>
          </Button>
        </div>
      </div>
    )
  }

  // MSA gate: org owners and reps must sign before using the portal.
  // Invited members ride on the org owner's signature.
  const needsMsa =
    (ctx.kind === 'ORG' && ctx.role === 'OWNER' && !ctx.org.msaSignedAt) ||
    (ctx.kind === 'REP' && ctx.rep && !ctx.rep.msaSignedAt)
  if (needsMsa) redirect('/partners/agreement')

  const marginModel = ctx.org.compensationModel === 'MARGIN'

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-brand-onyx text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/partners" className="text-lg font-bold tracking-wide">
              PEPTSCI <span className="font-normal text-white/60">Partners</span>
            </Link>
          </div>
          <div className="text-right text-xs text-white/60">
            <div className="font-medium text-white">{ctx.org.name}</div>
            {ctx.kind === 'REP' ? `Rep — ${ctx.rep?.name}` : `Org ${ctx.role?.toLowerCase()}`}
          </div>
        </div>
        <PortalNav kind={ctx.kind} role={ctx.role} marginModel={marginModel} />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  )
}
