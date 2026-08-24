import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { partnerNoAccessCopy, type PartnerNoAccessKind } from '@/lib/partners/access'
import { PartnerSignOutButton } from './PartnerSignOutButton'

export function PartnerNoAccess({ kind }: { kind: PartnerNoAccessKind }) {
  const copy = partnerNoAccessCopy(kind)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-onyx px-6 text-center text-white">
      <p className="text-xs font-semibold uppercase tracking-widest text-white/45">
        Partner portal
      </p>
      <h1 className="mt-3 text-2xl font-bold">{copy.title}</h1>
      <p className="mt-3 max-w-md text-white/70">{copy.body}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <PartnerSignOutButton
          variant="default"
          className="font-semibold"
          redirectUrl={copy.primary.href}
          label={copy.primary.label}
        />
        <Button
          asChild
          variant="outline"
          className="border-white/20 bg-transparent font-semibold text-white hover:bg-white/10 hover:text-white"
        >
          <Link href={copy.secondary.href}>{copy.secondary.label}</Link>
        </Button>
      </div>
    </div>
  )
}
