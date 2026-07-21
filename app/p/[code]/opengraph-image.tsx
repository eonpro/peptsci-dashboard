import { prisma } from '@/lib/prisma'
import { isValidReferralCode } from '@/lib/partners/referral'
import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og/card'

export const alt = 'You\u2019re invited to PeptSci'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const dynamic = 'force-dynamic'

/**
 * Personalized share card for co-branded partner invites (/p/<code>): shows
 * who the invitation is from, mirroring the landing page headline. Falls back
 * to a generic invite card if the code doesn't resolve (the page itself 404s,
 * but scrapers may still request the image).
 */
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  let inviter: string | null = null
  if (prisma && isValidReferralCode(code)) {
    try {
      const link = await prisma.referralLink.findUnique({
        where: { code: code.toLowerCase() },
        select: {
          active: true,
          org: { select: { name: true, status: true } },
          rep: { select: { name: true } },
        },
      })
      if (link?.active && link.org.status === 'ACTIVE') {
        inviter = link.rep?.name ? `${link.rep.name} · ${link.org.name}` : link.org.name
      }
    } catch {
      // fall through to the generic card
    }
  }

  return renderOgCard({
    eyebrow: 'Personal invitation',
    title: inviter ? `You\u2019ve been invited by ${inviter}` : 'You\u2019ve been invited to PeptSci',
    subtitle:
      'Join the members-only platform for licensed practices to order high-purity research peptides with practice pricing.',
  })
}
