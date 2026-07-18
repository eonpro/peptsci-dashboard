import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { REF_COOKIE, REF_COOKIE_MAX_AGE_SECONDS, isValidReferralCode } from '@/lib/partners/referral'

export const dynamic = 'force-dynamic'

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

    // Best-effort click counter; never blocks the redirect.
    prisma.referralLink
      .update({ where: { id: link.id }, data: { clickCount: { increment: 1 } } })
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
