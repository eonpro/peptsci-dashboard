import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopActor } from '@/lib/shop-actor'
import { notifyAdmins } from '@/lib/notifications/service'
import { sendEmail } from '@/lib/email/client'
import { createTicket } from '@/lib/support-tickets'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
})

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@peptsci.com'

/**
 * POST /api/shop/support — client-portal assistant messages. Each message
 * rings the admin notification bell and lands in the support inbox with the
 * practice context attached, so the team can reply by email.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()

    const { limited, remaining, retryAfter } = await checkRateLimit(
      getRateLimitKey(request, userId),
      RATE_LIMITS.standard
    )
    if (limited) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        { status: 429, headers: getRateLimitHeaders(remaining, RATE_LIMITS.standard, retryAfter) }
      )
    }

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('Message is required', 400, 'VALIDATION_ERROR')
    const message = parsed.data.message

    const actor = await resolveShopActor(userId).catch(() => null)
    let practice = 'Unknown practice'
    let contactEmail: string | null = null
    if (actor && prisma) {
      const client = await prisma.client.findUnique({
        where: { id: actor.clientId },
        select: { organizationName: true, contactEmail: true },
      })
      if (client) {
        practice = client.organizationName
        contactEmail = client.contactEmail
      }
    }

    // Persist as a support ticket so the message lands in the trackable queue
    // (/support admin page, /shop/support for the clinic) instead of living
    // only in an inbox. Best-effort: fall through to bell + email regardless.
    let ticketId: string | null = null
    if (actor && prisma) {
      try {
        const sender = await prisma.user.findUnique({
          where: { id: actor.userId },
          select: { firstName: true, lastName: true, email: true },
        })
        const senderName =
          [sender?.firstName, sender?.lastName].filter(Boolean).join(' ') ||
          sender?.email ||
          practice
        const subject = message.length > 80 ? `${message.slice(0, 77)}…` : message
        const ticket = await createTicket({
          clientId: actor.clientId,
          subject,
          body: message,
          senderId: actor.userId,
          senderName,
          createdBy: userId,
        })
        ticketId = ticket.id
      } catch (err) {
        logger.warn('[shop/support] ticket create failed', { err: String(err) })
      }
    }

    // Bell for the admin team (best effort — never fails the request).
    await notifyAdmins({
      category: 'CLIENT',
      priority: 'HIGH',
      title: `Support message from ${practice}`,
      message: message.length > 140 ? `${message.slice(0, 140)}…` : message,
      actionUrl: ticketId ? `/support?ticket=${ticketId}` : actor ? `/clients/${actor.clientId}` : '/clients',
      sourceType: 'support_chat',
      sourceId: ticketId ?? `${userId}:${Date.now()}`,
    }).catch((err) => logger.warn('[shop/support] notify failed', { err: String(err) }))

    // Support inbox email with reply-to pointing at the clinic.
    await sendEmail({
      to: SUPPORT_EMAIL,
      subject: `[Client Portal] ${practice} needs help`,
      text: `Practice: ${practice}\nContact: ${contactEmail ?? 'n/a'}\nClerk user: ${userId}\n\n${message}`,
      html: `<p><strong>Practice:</strong> ${practice}<br/><strong>Contact:</strong> ${contactEmail ?? 'n/a'}</p><p>${message.replace(/\n/g, '<br/>')}</p>`,
      ...(contactEmail ? { replyTo: contactEmail } : {}),
    }).catch((err) => logger.warn('[shop/support] email failed', { err: String(err) }))

    return successResponse({ ok: true })
  } catch (error) {
    logger.error(
      '[shop/support] error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to send message')
  }
}
