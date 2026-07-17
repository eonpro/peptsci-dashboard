import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPartnerContext } from '@/lib/partners/auth'
import { prisma } from '@/lib/prisma'
import { msaDocument } from '@/lib/partners/msa'
import { SignForm } from './SignForm'
import { PrintButton } from './PrintButton'

export const dynamic = 'force-dynamic'

/**
 * MSA page. Lives OUTSIDE the (portal) route group so the portal layout's
 * unsigned-gate redirect can land here without looping. Unsigned org owners /
 * reps see the sign flow; signed users (and org members) see the executed copy.
 */
export default async function PartnerAgreementPage() {
  const ctx = await getPartnerContext()
  if (!ctx) redirect('/partners')
  const doc = msaDocument()

  const mustSign =
    (ctx.kind === 'ORG' && ctx.role === 'OWNER' && !ctx.org.msaSignedAt) ||
    (ctx.kind === 'REP' && ctx.rep && !ctx.rep.msaSignedAt)

  const executed = await prisma!.partnerAgreement.findFirst({
    where: {
      orgId: ctx.org.id,
      ...(ctx.kind === 'REP' ? { repId: ctx.rep!.id } : { signerKind: 'ORG' }),
    },
    orderBy: { signedAt: 'desc' },
  })

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-[#050722] text-white print:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/partners" className="text-lg font-bold tracking-wide">
            PEPTSCI <span className="font-normal text-white/60">Partners</span>
          </Link>
          <span className="text-xs text-white/60">{ctx.org.name}</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-start justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{doc.title}</h1>
            <p className="text-sm text-slate-500">
              Version {doc.version}
              {executed && (
                <>
                  {' · '}Signed by <strong>{executed.signerName}</strong> on{' '}
                  {executed.signedAt.toLocaleDateString()}
                </>
              )}
            </p>
          </div>
          {executed && <PrintButton />}
        </div>

        {mustSign && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 print:hidden">
            Review and sign the agreement below to unlock your partner portal.
          </p>
        )}

        <article className="whitespace-pre-wrap rounded-xl border bg-white p-6 font-serif text-[15px] leading-relaxed text-slate-800">
          {(executed?.documentText ?? doc.text).trim()}
        </article>

        {executed && (
          <div className="mt-4 rounded-xl border bg-white p-6">
            <p className="text-xs uppercase tracking-wide text-slate-400">Executed by</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-semibold text-slate-900">{executed.signerName}</p>
                {executed.signerTitle && <p className="text-sm text-slate-500">{executed.signerTitle}</p>}
                {executed.legalEntityName && (
                  <p className="text-sm text-slate-500">{executed.legalEntityName}</p>
                )}
                <p className="mt-1 text-xs text-slate-400">
                  {executed.signedAt.toLocaleString()} · document SHA-256 {executed.documentHash.slice(0, 16)}…
                </p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={executed.signatureImage} alt="Signature" className="h-16" />
            </div>
          </div>
        )}

        {mustSign && (
          <div className="mt-6 print:hidden">
            <SignForm
              defaultEntityName={ctx.kind === 'ORG' ? ctx.org.name : ctx.org.name}
              defaultSignerName={ctx.kind === 'REP' ? (ctx.rep?.name ?? '') : (ctx.org.contactName ?? '')}
            />
          </div>
        )}

        {!mustSign && (
          <div className="mt-6 print:hidden">
            <Link
              href="/partners"
              className="inline-block rounded-lg bg-[#213cef] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1a30c4]"
            >
              Go to your portal
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
