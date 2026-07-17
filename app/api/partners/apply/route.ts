import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { notifyAdmins } from '@/lib/notifications/service'
import { sendAffiliateApplicationReceivedEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const applySchema = z.object({
  orgName: z.string().trim().min(2, 'Organization name is required').max(200),
  contactName: z.string().trim().min(2, 'Contact name is required').max(200),
  email: z.string().trim().email('Enter a valid email').max(255).toLowerCase(),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  website: z.string().trim().max(255).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
})

/**
 * POST /api/partners/apply — public submission for the affiliate program.
 * Creates a PENDING PartnerOrg; an admin reviews it at /dashboard → Partners,
 * sets the commission rate, and approves it (which provisions the Clerk
 * login + sends the approval email). Rate-limited by IP.
 */
export async function POST(request: NextRequest) {
  try {
    const rl = await checkRateLimit(getRateLimitKey(request), RATE_LIMITS.auth)
    if (rl.limited) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Too many attempts. Please wait a minute and try again.', code: 'RATE_LIMITED' },
        { status: 429, headers: getRateLimitHeaders(rl.remaining, RATE_LIMITS.auth, rl.retryAfter) }
      )
    }

    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = applySchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const { orgName, contactName, email } = parsed.data
    const phone = parsed.data.phone || null
    const website = parsed.data.website || null
    const notes = parsed.data.notes || null

    const existing = await prisma.partnerOrg.findUnique({
      where: { contactEmail: email },
      select: { id: true, status: true },
    })
    if (existing) {
      return errorResponse(
        existing.status === 'PENDING'
          ? 'An application with this email is already under review.'
          : 'A partner account with this email already exists. Try signing in.',
        409,
        'DUPLICATE_APPLICATION'
      )
    }

    const org = await prisma.partnerOrg.create({
      data: {
        name: orgName,
        contactName,
        contactEmail: email,
        contactPhone: phone,
        website,
        notes,
        status: 'PENDING',
      },
    })

    // Fire-and-forget: notification/email failures must never fail the application.
    notifyAdmins({
      category: 'CLIENT',
      priority: 'HIGH',
      title: 'New partner application',
      message: `${orgName} applied to the affiliate partner program.`,
      actionUrl: `/partners-admin/${org.id}`,
      sourceType: 'partner:application',
      sourceId: org.id,
    }).catch((e) =>
      logger.warn('[PARTNER APPLY] admin notify failed (non-blocking)', {
        orgId: org.id,
        error: e instanceof Error ? e.message : String(e),
      })
    )
    sendAffiliateApplicationReceivedEmail({ to: email, contactName, orgName }).catch(() => {})

    logger.info('[PARTNER APPLY] Application received', { orgId: org.id, orgName })
    return successResponse({ success: true }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Application failed'
    logger.error('[PARTNER APPLY] error', { message })
    return errorResponse(message)
  }
}
