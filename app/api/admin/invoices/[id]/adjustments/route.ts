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
import { addAdjustment } from '@/lib/invoicing/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const body = z
  .object({
    kind: z.enum(['FIXED', 'PERCENT']),
    amount: z.number().optional(),
    percent: z.number().optional(),
    reason: z.string().optional(),
  })
  .refine((b) => (b.kind === 'FIXED' ? typeof b.amount === 'number' : typeof b.percent === 'number'), {
    message: 'FIXED requires amount; PERCENT requires percent',
  })

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const parsed = body.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return errorResponse('Invalid request body', 400, 'INVALID_BODY')

    const view = await addAdjustment(id, {
      kind: parsed.data.kind,
      amount: parsed.data.amount,
      percent: parsed.data.percent,
      reason: parsed.data.reason,
      createdBy: userId ?? undefined,
    })
    return successResponse({ invoice: view }, 201)
  } catch (error) {
    logger.error('[admin/invoices/:id/adjustments] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to add adjustment')
  }
}
