/**
 * Helpers for backfilling partner commission on CAPTURED orders that were
 * minted without calling accrueCommissionForOrder (stripe-convert, invoice
 * product fulfill, Shopify inbound).
 */

import { prisma } from '@/lib/prisma'
import { orderReference } from '@/lib/partners/accrual'

export type PartnerAccrualCandidateInput = {
  paymentStatus: string
  status: string
  partnerOrgId: string | null
  total: number
}

/** CAPTURED, not cancelled/draft, attributed clinic, positive order total. */
export function isPartnerAccrualBackfillCandidate(
  order: PartnerAccrualCandidateInput
): boolean {
  if (order.paymentStatus !== 'CAPTURED') return false
  if (order.status === 'CANCELLED' || order.status === 'DRAFT') return false
  if (!order.partnerOrgId) return false
  if (!(order.total > 0)) return false
  return true
}

export type PartnerAccrualCandidate = {
  orderId: string
  orderNumber: number
  clientId: string
  organizationName: string
  partnerOrgId: string
  partnerOrgName: string
  partnerOrgStatus: string
  commissionRateBps: number
  compensationModel: string
  total: number
  revenueCents: number
  source: string
  paidAt: string | null
  reference: string
}

export type FindPartnerAccrualCandidatesOpts = {
  /** Limit scan size (default 500). */
  take?: number
  clientId?: string
  partnerOrgId?: string
}

/**
 * CAPTURED attributed orders with no PartnerTransaction reference `order:<id>`.
 */
export async function findPartnerAccrualCandidates(
  opts: FindPartnerAccrualCandidatesOpts = {}
): Promise<PartnerAccrualCandidate[]> {
  if (!prisma) return []

  const take = Math.min(Math.max(opts.take ?? 500, 1), 2000)
  const clientId = opts.clientId?.trim() || undefined
  const partnerOrgId = opts.partnerOrgId?.trim() || undefined

  const orders = await prisma.order.findMany({
    where: {
      paymentStatus: 'CAPTURED',
      status: { notIn: ['CANCELLED', 'DRAFT'] },
      ...(clientId ? { clientId } : {}),
      client: {
        partnerOrgId: partnerOrgId ? partnerOrgId : { not: null },
      },
    },
    orderBy: { orderNumber: 'asc' },
    take,
    select: {
      id: true,
      orderNumber: true,
      clientId: true,
      total: true,
      source: true,
      paidAt: true,
      paymentStatus: true,
      status: true,
      client: {
        select: {
          organizationName: true,
          partnerOrgId: true,
          partnerOrg: {
            select: {
              id: true,
              name: true,
              status: true,
              commissionRateBps: true,
              compensationModel: true,
            },
          },
        },
      },
    },
  })

  const eligible = orders.filter((o) =>
    isPartnerAccrualBackfillCandidate({
      paymentStatus: o.paymentStatus,
      status: o.status,
      partnerOrgId: o.client.partnerOrgId,
      total: Number(o.total),
    })
  )
  if (eligible.length === 0) return []

  const refs = eligible.map((o) => orderReference(o.id))
  const existing = await prisma.partnerTransaction.findMany({
    where: { reference: { in: refs } },
    select: { reference: true },
  })
  const have = new Set(existing.map((e) => e.reference).filter(Boolean) as string[])

  const out: PartnerAccrualCandidate[] = []
  for (const o of eligible) {
    const reference = orderReference(o.id)
    if (have.has(reference)) continue
    const org = o.client.partnerOrg
    if (!org || !o.client.partnerOrgId) continue
    const total = Number(o.total)
    out.push({
      orderId: o.id,
      orderNumber: o.orderNumber,
      clientId: o.clientId,
      organizationName: o.client.organizationName,
      partnerOrgId: org.id,
      partnerOrgName: org.name,
      partnerOrgStatus: org.status,
      commissionRateBps: org.commissionRateBps,
      compensationModel: org.compensationModel,
      total,
      revenueCents: Math.round(total * 100),
      source: o.source,
      paidAt: o.paidAt ? o.paidAt.toISOString() : null,
      reference,
    })
  }
  return out
}
