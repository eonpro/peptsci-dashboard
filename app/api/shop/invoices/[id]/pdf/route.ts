import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopClientId } from '@/lib/shop-actor'
import { getInvoice } from '@/lib/invoicing/service'
import { generateInvoicePdf } from '@/lib/invoicing/pdf'
import { formatInvoiceNumber } from '@/lib/invoicing/core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/shop/invoices/[id]/pdf — the client's own invoice as a PDF. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const clientId = await resolveShopClientId(userId)
    if (!clientId) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const { id } = await params
    const view = await getInvoice(id)
    // Ownership check + hide internal drafts. 404 (not 403) so invoice ids
    // can't be probed across accounts.
    if (!view || view.invoice.clientId !== clientId || view.invoice.status === 'DRAFT') {
      return errorResponse('Invoice not found', 404, 'NOT_FOUND')
    }

    const pdf = await generateInvoicePdf(view)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="peptsci-${formatInvoiceNumber(view.invoice.invoiceNumber)}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    logger.error('[shop/invoices/:id/pdf] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to generate invoice PDF')
  }
}
