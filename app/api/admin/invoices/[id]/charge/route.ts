import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getInvoice } from '@/lib/invoicing/service'
import { chargeInvoiceWithSavedCard } from '@/lib/stripe/charge-invoice-saved-card'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const body = z.object({
  paymentMethodId: z.string().optional(),
})

/**
 * POST /api/admin/invoices/[id]/charge
 * Charge the invoice amount due with the client's saved card (off-session).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const parsed = body.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return errorResponse('Invalid request body', 400, 'INVALID_BODY')

    const charge = await chargeInvoiceWithSavedCard({
      invoiceId: id,
      paymentMethodId: parsed.data.paymentMethodId,
      metadata: { source: 'admin_invoice_charge' },
      notes: 'Charged saved card (admin)',
    })

    if (charge.status === 'not_found') {
      return errorResponse('Invoice not found', 404, 'NOT_FOUND')
    }

    const view = await getInvoice(id)
    return successResponse({ charge, invoice: view })
  } catch (error) {
    logger.error(
      '[admin/invoices/:id/charge] error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to charge invoice')
  }
}
