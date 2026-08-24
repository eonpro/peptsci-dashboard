import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { getPartnerContext } from '@/lib/partners/auth'
import { partnerNoAccessKind } from '@/lib/partners/access'
import { PortalSidebar } from './_components/PortalSidebar'
import { PortalTopbar } from './_components/PortalTopbar'
import { PartnerNoAccess } from './_components/PartnerNoAccess'
import { PartnerPortalProvider } from './_components/PartnerPortalProvider'
import { PartnerSectionNav } from './_components/PartnerSectionNav'
import { PortalMobileNav } from './_components/PortalMobileNav'

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
    const { sessionClaims } = await auth()
    const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role
    return <PartnerNoAccess kind={partnerNoAccessKind(role)} />
  }

  // MSA gate: org owners and reps must sign before using the portal.
  // Invited members ride on the org owner's signature.
  const needsMsa =
    (ctx.kind === 'ORG' && ctx.role === 'OWNER' && !ctx.org.msaSignedAt) ||
    (ctx.kind === 'REP' && ctx.rep && !ctx.rep.msaSignedAt)
  if (needsMsa) redirect('/partners/agreement')

  const navCtx = {
    kind: ctx.kind,
    role: ctx.role,
    marginModel: ctx.org.compensationModel === 'MARGIN',
  }
  const identity = {
    orgName: ctx.org.name,
    roleLabel: ctx.kind === 'REP' ? `Rep — ${ctx.rep?.name}` : `Org ${ctx.role?.toLowerCase()}`,
  }

  return (
    <PartnerPortalProvider kind={navCtx.kind} role={navCtx.role} marginModel={navCtx.marginModel}>
      <div className="min-h-screen bg-slate-50">
        <PortalSidebar ctx={navCtx} identity={identity} />
        <div className="lg:pl-64">
          <PortalTopbar ctx={navCtx} identity={identity} />
          <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8 lg:pb-8">
            <PartnerSectionNav />
            {children}
          </main>
        </div>
        <PortalMobileNav />
      </div>
    </PartnerPortalProvider>
  )
}
