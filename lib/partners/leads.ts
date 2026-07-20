/**
 * Partner lead registration + protected attribution (Wave 1).
 *
 * A partner registers a prospect BEFORE the clinic signs up. While the
 * protection window is open, a clinic onboarding with a matching email or NPI
 * is attributed to the registering org/rep even without a link click.
 * Precedence at onboarding: referral cookie first (explicit click intent),
 * then the oldest active matching lead.
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export const LEAD_PROTECTION_DAYS = 90

export interface LeadMatch {
  leadId: string
  orgId: string
  repId: string | null
}

/** Normalized for matching: trimmed, lowercased. */
export function normalizeLeadEmail(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase()
  return e || null
}

export function normalizeNpi(npi: string | null | undefined): string | null {
  const digits = npi?.replace(/\D/g, '')
  return digits && digits.length === 10 ? digits : null
}

/**
 * Find the winning active lead for a clinic that is onboarding right now.
 * Email match beats NPI match; among equals the OLDEST registration wins
 * (first to register the prospect gets the protection).
 */
export async function matchLeadForNewClient(input: {
  email?: string | null
  npiNumber?: string | null
}): Promise<LeadMatch | null> {
  if (!prisma) return null
  const email = normalizeLeadEmail(input.email)
  const npi = normalizeNpi(input.npiNumber)
  if (!email && !npi) return null

  try {
    const now = new Date()
    const candidates = await prisma.partnerLead.findMany({
      where: {
        status: { in: ['NEW', 'WORKING'] },
        protectedUntil: { gte: now },
        org: { status: 'ACTIVE' },
        OR: [
          ...(email ? [{ email }] : []),
          ...(npi ? [{ npiNumber: npi }] : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, orgId: true, repId: true, email: true, npiNumber: true },
    })
    if (candidates.length === 0) return null
    const byEmail = email ? candidates.find((c) => c.email === email) : undefined
    const winner = byEmail ?? candidates[0]
    return { leadId: winner.id, orgId: winner.orgId, repId: winner.repId }
  } catch (err) {
    logger.warn('[PARTNER LEADS] match failed (non-blocking)', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Mark a lead CONVERTED and pin the clinic it became. Best-effort — called
 * after the client row exists.
 */
export async function convertLead(leadId: string, clientId: string): Promise<void> {
  if (!prisma) return
  await prisma.partnerLead
    .update({
      where: { id: leadId },
      data: { status: 'CONVERTED', matchedClientId: clientId },
    })
    .catch((err) =>
      logger.warn('[PARTNER LEADS] convert failed (non-blocking)', {
        leadId,
        clientId,
        error: err instanceof Error ? err.message : String(err),
      })
    )
}

/**
 * Flip past-window NEW/WORKING leads to EXPIRED (idempotent; run by the
 * daily partner cron). Returns how many were expired.
 */
export async function expireStaleLeads(): Promise<number> {
  if (!prisma) return 0
  const result = await prisma.partnerLead.updateMany({
    where: { status: { in: ['NEW', 'WORKING'] }, protectedUntil: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  })
  return result.count
}
