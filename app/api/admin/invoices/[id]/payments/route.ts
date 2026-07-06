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
import { recordPayment } from '@/lib/invoicing/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const body = z.object({
  amount: z.number().positive(),
  method: z.enum(['wire', 'ach', 'check', 'card', 'stripe', 'other']).optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  paidAt: z.string().datetime().optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const parsed = body.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return errorResponse('Invalid request body', 400, 'INVALID_BODY')

    const view = await recordPayment(id, {
      amount: parsed.data.amount,
      method: parsed.data.method,
      reference: parsed.data.reference,
      notes: parsed.data.notes,
      paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : undefined,
    })
    return successResponse({ invoice: view }, 201)
  } catch (error) {
    const msg = error instanceof Error ? error.message : ''
    if (msg.includes('positive')) return errorResponse(msg, 400, 'INVALID_AMOUNT')
    if (msg === 'Invoice not found') return errorResponse(msg, 404, 'NOT_FOUND')
    if (msg.includes('void invoice')) return errorResponse(msg, 409, 'INVOICE_VOID')
    if (msg.includes('different invoice')) return errorResponse(msg, 409, 'PAYMENT_ALREADY_RECORDED')
    logger.error('[admin/invoices/:id/payments] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to record payment')
  }
}
