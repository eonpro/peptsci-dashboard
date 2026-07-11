import { NextRequest } from 'next/server'
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
import { formatInvoiceNumber } from '@/lib/invoicing/core'
import { sendInvoiceIssuedEmail } from '@/lib/email'
import { appUrl } from '@/lib/app-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

/** POST — email the invoice summary to the client's contact/billing email. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const view = await getInvoice(id)
    if (!view) return errorResponse('Invoice not found', 404, 'NOT_FOUND')

    const to = view.invoice.client?.contactEmail
    if (!to) return errorResponse('Client has no contact email on file', 422, 'NO_EMAIL')

    const result = await sendInvoiceIssuedEmail({
      to,
      customerName: view.invoice.client?.organizationName,
      invoiceNumber: formatInvoiceNumber(view.invoice.invoiceNumber),
      amountDue: usd(view.totals.amountDue),
      dueDate: view.invoice.dueDate
        ? new Date(view.invoice.dueDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        : '—',
      // "View invoice" → the client portal, where they can pay online.
      invoiceUrl: appUrl('/shop/invoices'),
    })

    return successResponse({ sent: result.ok, skipped: result.skipped ?? false })
  } catch (error) {
    logger.error('[admin/invoices/:id/send] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to send invoice email')
  }
}
