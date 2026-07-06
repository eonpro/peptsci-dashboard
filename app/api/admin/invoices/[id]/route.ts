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
import { getInvoice, issueInvoice, voidInvoice } from '@/lib/invoicing/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const patchBody = z.object({ action: z.enum(['issue', 'void']) })

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const view = await getInvoice(id)
    if (!view) return errorResponse('Invoice not found', 404, 'NOT_FOUND')
    return successResponse({ invoice: view })
  } catch (error) {
    logger.error('[admin/invoices/:id] GET error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load invoice')
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const parsed = patchBody.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return errorResponse('Invalid request body', 400, 'INVALID_BODY')

    const view = parsed.data.action === 'issue' ? await issueInvoice(id) : await voidInvoice(id)
    return successResponse({ invoice: view })
  } catch (error) {
    const msg = error instanceof Error ? error.message : ''
    if (msg === 'Invoice not found') return errorResponse('Invoice not found', 404, 'NOT_FOUND')
    if (msg.includes('recorded payments')) return errorResponse(msg, 409, 'INVOICE_HAS_PAYMENTS')
    logger.error('[admin/invoices/:id] PATCH error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to update invoice')
  }
}
