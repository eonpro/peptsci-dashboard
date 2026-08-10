import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { Prisma } from '@prisma/client'
import { clerkClient } from '@clerk/nextjs/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { notifyAdmins } from '@/lib/notifications/service'
import { onboardingSchema, resolveShippingAddress, serializeClientProfile } from '@/lib/profile'
import { NPI_BYPASS } from '@/lib/npi'
import {
  REF_COOKIE,
  isValidReferralCode,
  attributionFromLink,
  type ReferralAttribution,
} from '@/lib/partners/referral'
import { CLINIC_REF_COOKIE } from '@/lib/referrals/credit'
import { applicationReference } from '@/lib/application-reference'
import { matchLeadForNewClient, convertLead } from '@/lib/partners/leads'
import { sendPartnerClinicAttributedEmail } from '@/lib/email'
import {
  ensureUserLinkedToInviteClient,
  readInviteClientClaims,
} from '@/lib/link-client-from-invite'
import { getRedirectUrl, type UserStatus } from '@/lib/roles'

/**
 * Resolve clinic-to-clinic referral attribution from the /refer/<code>
 * cookie. Best-effort; self-referrals are impossible (the new client doesn't
 * exist yet) and non-approved referrers don't attribute.
 */
async function resolveClinicReferrerId(): Promise<string | null> {
  if (!prisma) return null
  try {
    const jar = await cookies()
    const code = jar.get(CLINIC_REF_COOKIE)?.value
    if (!code || !isValidReferralCode(code)) return null
    const referrer = await prisma.client.findUnique({
      where: { referralCode: code.toLowerCase() },
      select: { id: true, onboardingStatus: true },
    })
    if (!referrer || referrer.onboardingStatus !== 'APPROVED') return null
    return referrer.id
  } catch {
    return null
  }
}

/**
 * Resolve partner attribution from the referral cookie set by /join/<code>.
 * Best-effort: any failure (or a deactivated link / suspended org) simply
 * onboards the clinic unattributed.
 */
async function resolveReferralAttribution(): Promise<ReferralAttribution | null> {
  if (!prisma) return null
  try {
    const jar = await cookies()
    const code = jar.get(REF_COOKIE)?.value
    if (!code || !isValidReferralCode(code)) return null
    const link = await prisma.referralLink.findUnique({
      where: { code: code.toLowerCase() },
      select: { id: true, orgId: true, repId: true, active: true, org: { select: { status: true } } },
    })
    if (!link || link.org.status !== 'ACTIVE') return null
    return attributionFromLink({
      id: link.id,
      orgId: link.orgId,
      repId: link.repId,
      active: link.active,
    })
  } catch {
    return null
  }
}

export const dynamic = 'force-dynamic'

const isClerkConfigured = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')

/**
 * GET /api/onboarding
 * Returns whether the caller already has a linked practice (so the page can
 * skip the form / redirect appropriately). Invited users joining an existing
 * client self-heal from Clerk invite metadata when the webhook hasn't linked
 * User.clientId yet.
 */
export async function GET() {
  const { userId, isAuthenticated, status } = await requireAuth()
  if (!isAuthenticated || !userId) return unauthorizedResponse()
  if (!prisma) return successResponse({ hasClient: false })

  let user = await prisma.user.findUnique({
    where: { clerkUserId: userId },
    include: { client: true },
  })

  // Invite self-heal: session/Clerk metadata has clientId but DB link lagged.
  if (!user?.client) {
    const claims = await readInviteClientClaims()
    if (claims.clientId) {
      const linkedId = await ensureUserLinkedToInviteClient(userId, claims)
      if (linkedId) {
        user = await prisma.user.findUnique({
          where: { clerkUserId: userId },
          include: { client: true },
        })
      }
    }
  }

  if (!user?.client) return successResponse({ hasClient: false })

  const accountStatus = (status ?? user.status) as UserStatus
  const redirectTo =
    accountStatus === 'ACTIVE' ? getRedirectUrl(user.role) : '/pending-approval'

  return successResponse({
    hasClient: true,
    redirectTo,
    profile: serializeClientProfile(user.client),
  })
}

/**
 * POST /api/onboarding
 * Creates the practice `Client` for a newly signed-up CLIENT, links the user,
 * and mirrors the clientId into Clerk public metadata. Idempotent: if the
 * caller already has a client, returns it unchanged.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()

    const rl = await checkRateLimit(getRateLimitKey(request, userId), RATE_LIMITS.auth)
    if (rl.limited) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        { status: 429, headers: getRateLimitHeaders(rl.remaining, RATE_LIMITS.auth, rl.retryAfter) }
      )
    }

    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = onboardingSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const data = parsed.data

    // Ensure a local user row exists (webhook normally creates it).
    const user = await prisma.user.upsert({
      where: { clerkUserId: userId },
      update: {},
      create: { clerkUserId: userId, role: 'CLIENT', status: 'PENDING' },
      include: { client: true },
    })

    // Idempotent: already onboarded.
    if (user.client) {
      return successResponse({ success: true, profile: serializeClientProfile(user.client) })
    }

    // Invited to an existing practice — never create a second Client. Link
    // from Clerk invite metadata and return that practice instead.
    const inviteClaims = await readInviteClientClaims()
    if (inviteClaims.clientId) {
      const linkedId = await ensureUserLinkedToInviteClient(userId, inviteClaims)
      if (linkedId) {
        const linked = await prisma.client.findUnique({ where: { id: linkedId } })
        if (linked) {
          return successResponse({
            success: true,
            alreadyLinked: true,
            profile: serializeClientProfile(linked),
          })
        }
      }
      return errorResponse(
        'You were invited to an existing practice. Contact support if you cannot access it.',
        409,
        'INVITE_CLIENT_EXISTS'
      )
    }

    // Non-provider bypass: the all-zeros sentinel is never stored — store
    // null so non-provider accounts do not look like a real NPI.
    const isNpiBypassed = data.npiNumber === NPI_BYPASS
    const npiNumber = isNpiBypassed ? null : data.npiNumber

    const shippingAddress = resolveShippingAddress(data)
    const attribution = await resolveReferralAttribution()
    const clinicReferrerId = await resolveClinicReferrerId()
    // Protected-lead attribution: only when there's no explicit link click.
    const leadMatch = attribution
      ? null
      : await matchLeadForNewClient({ email: data.contactEmail, npiNumber })

    const client = await prisma.client.create({
      data: {
        ...(attribution
          ? {
              partnerOrgId: attribution.partnerOrgId,
              partnerRepId: attribution.partnerRepId,
              referralLinkId: attribution.referralLinkId,
            }
          : leadMatch
            ? { partnerOrgId: leadMatch.orgId, partnerRepId: leadMatch.repId }
            : {}),
        ...(clinicReferrerId ? { referredByClientId: clinicReferrerId } : {}),
        organizationName: data.organizationName,
        npiNumber,
        providerName: isNpiBypassed ? data.providerName || null : data.providerName,
        npiData: isNpiBypassed
          ? Prisma.JsonNull
          : ((data.npiData as Prisma.InputJsonValue) ?? Prisma.JsonNull),
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        smsOptIn: data.smsOptIn,
        smsOptInAt: data.smsOptIn ? new Date() : null,
        billingAddress: data.billingAddress as unknown as Prisma.InputJsonValue,
        shippingAddress: shippingAddress as unknown as Prisma.InputJsonValue,
        onboardingStatus: 'PENDING',
        users: { connect: { id: user.id } },
      },
    })

    // Mirror clientId into Clerk so middleware/session can resolve it.
    if (isClerkConfigured) {
      try {
        const clerk = await clerkClient()
        await clerk.users.updateUserMetadata(userId, {
          publicMetadata: { role: 'CLIENT', status: 'PENDING', clientId: client.id },
        })
      } catch (clerkError) {
        logger.error(
          'Failed to set clientId in Clerk metadata',
          { userId, clientId: client.id },
          clerkError instanceof Error ? clerkError : new Error(String(clerkError))
        )
        // Non-fatal: the local link is authoritative for the shop actor resolver.
      }
    }

    const reference = applicationReference('clinic', client.id, client.createdAt)

    // Alert ops that a new practice is waiting for approval. Fire-and-forget:
    // a notification failure must never fail the onboarding submission.
    notifyAdmins({
      category: 'CLIENT',
      priority: 'HIGH',
      title: 'New account pending approval',
      message: `${client.organizationName} completed onboarding and is awaiting approval (ref ${reference}).`,
      actionUrl: `/clients/${client.id}`,
      sourceType: 'client:onboarding-submitted',
      sourceId: client.id,
      clientId: client.id,
    }).catch((e) =>
      logger.warn('[ONBOARDING] admin notify failed (non-blocking)', {
        clientId: client.id,
        error: e instanceof Error ? e.message : String(e),
      })
    )

    if (clinicReferrerId) {
      logger.info('[ONBOARDING] Client referred by clinic', {
        clientId: client.id,
        referrerClientId: clinicReferrerId,
      })
    }

    // Lead conversion + partner notification (best-effort, never blocks onboarding).
    if (leadMatch) {
      await convertLead(leadMatch.leadId, client.id)
      logger.info('[ONBOARDING] Client attributed via protected lead', {
        clientId: client.id,
        leadId: leadMatch.leadId,
        partnerOrgId: leadMatch.orgId,
      })
    }
    // Notify the partner their attribution landed (link OR lead).
    const attributedOrgId = attribution?.partnerOrgId ?? leadMatch?.orgId
    if (attributedOrgId && prisma) {
      prisma.partnerOrg
        .findUnique({
          where: { id: attributedOrgId },
          select: { contactEmail: true, contactName: true, notifyByEmail: true },
        })
        .then((org) => {
          if (org?.notifyByEmail) {
            return sendPartnerClinicAttributedEmail({
              to: org.contactEmail,
              contactName: org.contactName,
              clinicName: client.organizationName,
              via: attribution ? 'link' : 'lead',
            })
          }
        })
        .catch(() => {})
    }

    // Referral attribution succeeded — bump the link's signup counter (best-effort).
    if (attribution) {
      prisma.referralLink
        .update({
          where: { id: attribution.referralLinkId },
          data: { signupCount: { increment: 1 } },
        })
        .catch(() => {})
      logger.info('[ONBOARDING] Client attributed to partner', {
        clientId: client.id,
        partnerOrgId: attribution.partnerOrgId,
        partnerRepId: attribution.partnerRepId,
      })
    }

    logger.info('[ONBOARDING] Client created', { userId, clientId: client.id, reference })
    return successResponse(
      { success: true, reference, profile: serializeClientProfile(client) },
      201
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onboarding failed'
    logger.error('[ONBOARDING] error', { message }, error instanceof Error ? error : new Error(message))
    return errorResponse(message)
  }
}
