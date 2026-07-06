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
import { createInvoice, listInvoices } from '@/lib/invoicing/service'
import type { InvoiceStatus } from '@prisma/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const listQuery = z.object({
  clientId: z.string().optional(),
  status: z.enum(['DRAFT', 'OPEN', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID']).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
})

const createBody = z.object({
  clientId: z.string().min(1),
  orderIds: z.array(z.string()).optional(),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1),
        quantity: z.number().int().positive(),
        unitPrice: z.number().min(0),
        orderId: z.string().optional(),
      })
    )
    .optional(),
  paymentTermsDays: z.number().int().min(0).max(180).optional(),
  issueDate: z.string().datetime().optional(),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
  balanceForward: z.number().optional(),
  notes: z.string().optional(),
  issue: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const q = listQuery.parse(Object.fromEntries(new URL(request.url).searchParams))
    const result = await listInvoices({
      clientId: q.clientId,
      status: q.status as InvoiceStatus | undefined,
      page: q.page,
      limit: q.limit,
    })
    return successResponse(result)
  } catch (error) {
    logger.error('[admin/invoices] GET error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to list invoices')
  }
}

export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = createBody.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return errorResponse('Invalid request body', 400, 'INVALID_BODY')

    const view = await createInvoice({
      clientId: parsed.data.clientId,
      orderIds: parsed.data.orderIds,
      lineItems: parsed.data.lineItems,
      paymentTermsDays: parsed.data.paymentTermsDays,
      issueDate: parsed.data.issueDate ? new Date(parsed.data.issueDate) : undefined,
      periodStart: parsed.data.periodStart ? new Date(parsed.data.periodStart) : null,
      periodEnd: parsed.data.periodEnd ? new Date(parsed.data.periodEnd) : null,
      balanceForward: parsed.data.balanceForward,
      notes: parsed.data.notes,
      issue: parsed.data.issue,
      createdById: userId ?? undefined,
    })
    return successResponse({ invoice: view }, 201)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to create invoice'
    if (msg.includes('at least one line item')) return errorResponse(msg, 400, 'NO_LINES')
    if (msg.includes('already invoiced')) return errorResponse(msg, 409, 'ORDER_ALREADY_INVOICED')
    if (msg.includes('not billable or not found')) return errorResponse(msg, 400, 'ORDER_NOT_BILLABLE')
    if (msg.includes('unit price cannot be negative')) return errorResponse(msg, 400, 'NEGATIVE_UNIT_PRICE')
    logger.error('[admin/invoices] POST error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to create invoice')
  }
}
