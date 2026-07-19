import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { isValidReferralCode, REF_COOKIE_MAX_AGE_SECONDS } from '@/lib/partners/referral'
import { CLINIC_REF_COOKIE } from '@/lib/referrals/credit'

export const dynamic = 'force-dynamic'

/**
 * GET /refer/<code> — public clinic-referral landing (separate namespace from
 * partner /join links). Sets the 90-day attribution cookie and redirects to
 * sign-up. Invalid codes still redirect — prospects never see an error page.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params
  const redirect = NextResponse.redirect(new URL('/sign-up', request.url))

  if (!prisma || !isValidReferralCode(code)) return redirect

  try {
    const referrer = await prisma.client.findUnique({
      where: { referralCode: code.toLowerCase() },
      select: { id: true, onboardingStatus: true },
    })
    if (!referrer || referrer.onboardingStatus !== 'APPROVED') return redirect

    redirect.cookies.set(CLINIC_REF_COOKIE, code.toLowerCase(), {
      maxAge: REF_COOKIE_MAX_AGE_SECONDS,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
  } catch (error) {
    logger.warn('[REFER] clinic referral lookup failed', {
      code,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return redirect
}
