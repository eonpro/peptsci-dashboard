import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
} from '@/lib/auth'
import {
  fromOperatorPosition,
  getVialLabelSheetStartSlot,
  setVialLabelSheetStartSlot,
  toOperatorPosition,
} from '@/lib/labels/sheet-cursor'
import { labelsPerSheet, OL4891LP } from '@/lib/labels/sheet-layout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PER_SHEET = labelsPerSheet(OL4891LP)

const bodySchema = z.object({
  /** Operator position 1–36 where the next print should begin. */
  nextPosition: z.number().int().min(1).max(PER_SHEET),
})

/**
 * GET /api/admin/labels/sheet-cursor
 * Current OL4891LP continuation slot (shared across PeptSci / white-label vial prints).
 */
export async function GET() {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    const startSlot = await getVialLabelSheetStartSlot()
    return NextResponse.json({
      nextPosition: toOperatorPosition(startSlot),
      labelsPerSheet: PER_SHEET,
    })
  } catch {
    return errorResponse('Failed to read label sheet cursor')
  }
}

/**
 * PUT /api/admin/labels/sheet-cursor
 * Reset or jump the continuation cursor (e.g. after loading a fresh sheet → 1).
 */
export async function PUT(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const startSlot = await setVialLabelSheetStartSlot(
      fromOperatorPosition(parsed.data.nextPosition)
    )
    return NextResponse.json({
      nextPosition: toOperatorPosition(startSlot),
      labelsPerSheet: PER_SHEET,
    })
  } catch {
    return errorResponse('Failed to update label sheet cursor')
  }
}
