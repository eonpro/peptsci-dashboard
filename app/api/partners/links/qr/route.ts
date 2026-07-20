import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { forbiddenResponse, errorResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requirePartner, PartnerForbiddenError } from '@/lib/partners/auth'
import { referralUrl } from '@/lib/partners/referral'

export const dynamic = 'force-dynamic'

/**
 * GET /api/partners/links/qr?linkId=… — PNG QR code for one of the caller's
 * referral links (points at the co-branded /p/<code> landing page).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePartner()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const linkId = request.nextUrl.searchParams.get('linkId')
    if (!linkId) return errorResponse('linkId is required', 400, 'MISSING_LINK_ID')

    const link = await prisma.referralLink.findFirst({
      where: {
        id: linkId,
        orgId: ctx.org.id,
        ...(ctx.kind === 'REP' ? { repId: ctx.rep!.id } : {}),
      },
      select: { code: true },
    })
    if (!link) return errorResponse('Link not found', 404, 'NOT_FOUND')

    const target = referralUrl(link.code).replace('/join/', '/p/')
    const png = await QRCode.toBuffer(target, {
      type: 'png',
      width: 512,
      margin: 2,
      color: { dark: '#050722', light: '#ffffff' },
    })

    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="peptsci-referral-${link.code}.png"`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    return errorResponse('Failed to generate QR code')
  }
}
