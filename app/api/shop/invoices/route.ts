import { NextRequest } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopClientId } from '@/lib/shop-actor'
import { listInvoices, getClientOpenBalance } from '@/lib/invoicing/service'
import { formatInvoiceNumber } from '@/lib/invoicing/core'

export const dynamic = 'force-dynamic'

/**
 * GET /api/shop/invoices — the authenticated client's invoices (non-draft)
 * plus a billing summary (open balance + net-terms configuration) used by the
 * portal and the "bill to account" checkout option.
 */
export async function GET(_request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const clientId = await resolveShopClientId(userId)
    if (!clientId) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const [{ invoices }, client, openBalance] = await Promise.all([
      listInvoices({ clientId, limit: 100 }),
      prisma.client.findUnique({
        where: { id: clientId },
        select: { paymentTermsDays: true, creditLimit: true },
      }),
      getClientOpenBalance(clientId),
    ])

    // DRAFT invoices are internal working documents — never shown to clients.
    const visible = invoices.filter((v) => v.invoice.status !== 'DRAFT')

    return successResponse({
      invoices: visible.map((v) => ({
        id: v.invoice.id,
        invoiceNumber: formatInvoiceNumber(v.invoice.invoiceNumber),
        status: v.invoice.status,
        issueDate: v.invoice.issueDate.toISOString(),
        dueDate: v.invoice.dueDate?.toISOString() ?? null,
        paymentTermsDays: v.invoice.paymentTermsDays,
        grossTotal: v.totals.grossTotal,
        totalPayments: v.totals.totalPayments,
        amountDue: v.totals.amountDue,
        daysPastDue: v.daysPastDue,
      })),
      summary: {
        openBalance,
        paymentTermsDays: client?.paymentTermsDays ?? null,
        creditLimit: client?.creditLimit != null ? Number(client.creditLimit) : null,
      },
    })
  } catch (error) {
    logger.error('[shop/invoices] list error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load invoices')
  }
}
