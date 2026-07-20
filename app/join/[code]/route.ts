import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { REF_COOKIE, REF_COOKIE_MAX_AGE_SECONDS, isValidReferralCode } from '@/lib/partners/referral'

export const dynamic = 'force-dynamic'

/** Salted daily-rotating visitor fingerprint — unique-visitor estimates without PII. */
function visitorHash(request: NextRequest): string {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  const ua = request.headers.get('user-agent') ?? ''
  const day = new Date().toISOString().slice(0, 10)
  return createHash('sha256').update(`${day}|${ip}|${ua}`).digest('hex').slice(0, 24)
}

function utm(request: NextRequest, key: string): string | null {
  const value = request.nextUrl.searchParams.get(key)?.trim().slice(0, 80)
  return value || null
}

/**
 * GET /join/<code> — public referral-link entry point.
 *
 * Sets the 90-day attribution cookie and redirects to the branded welcome
 * page (/join/welcome). Invalid or inactive codes still redirect (no error
 * page for prospects; they just don't attribute). Click counting is
 * best-effort and only for live links.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params
  // Invalid/inactive codes go straight to sign-up (no attribution, no false
  // "invitation applied" messaging); valid codes get the branded welcome.
  const fallback = NextResponse.redirect(new URL('/sign-up', request.url))
  const redirect = NextResponse.redirect(new URL('/join/welcome', request.url))

  if (!prisma || !isValidReferralCode(code)) return fallback

  try {
    const link = await prisma.referralLink.findUnique({
      where: { code: code.toLowerCase() },
      select: { id: true, active: true, org: { select: { status: true } } },
    })
    if (!link || !link.active || link.org.status !== 'ACTIVE') return fallback

    redirect.cookies.set(REF_COOKIE, code.toLowerCase(), {
      maxAge: REF_COOKIE_MAX_AGE_SECONDS,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })

    // Best-effort click counter + click event (UTM attribution analytics);
    // never blocks the redirect.
    const refererHost = (() => {
      try {
        const referer = request.headers.get('referer')
        return referer ? new URL(referer).hostname.slice(0, 120) : null
      } catch {
        return null
      }
    })()
    prisma
      .$transaction([
        prisma.referralLink.update({
          where: { id: link.id },
          data: { clickCount: { increment: 1 } },
        }),
        prisma.referralLinkClick.create({
          data: {
            linkId: link.id,
            refererHost,
            utmSource: utm(request, 'utm_source'),
            utmMedium: utm(request, 'utm_medium'),
            utmCampaign: utm(request, 'utm_campaign'),
            visitorHash: visitorHash(request),
          },
        }),
      ])
      .catch(() => {})
  } catch (error) {
    logger.warn('[JOIN] referral lookup failed', {
      code,
      error: error instanceof Error ? error.message : String(error),
    })
    return fallback
  }

  return redirect
}
