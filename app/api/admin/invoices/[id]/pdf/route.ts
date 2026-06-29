import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, unauthorizedResponse, forbiddenResponse, errorResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getInvoice } from '@/lib/invoicing/service'
import { generateInvoicePdf } from '@/lib/invoicing/pdf'
import { formatInvoiceNumber } from '@/lib/invoicing/core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const view = await getInvoice(id)
    if (!view) return errorResponse('Invoice not found', 404, 'NOT_FOUND')

    const pdf = await generateInvoicePdf(view)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="peptsci-${formatInvoiceNumber(view.invoice.invoiceNumber)}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    logger.error('[admin/invoices/:id/pdf] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to generate invoice PDF')
  }
}
