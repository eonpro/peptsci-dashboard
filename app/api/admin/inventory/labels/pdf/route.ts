import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, unauthorizedResponse, forbiddenResponse, errorResponse } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { getBatch, recordLabelPrintEvent } from '@/lib/inventory-batches'
import { generatePeptSciLabelSheetPdf, PEPTSCI_LABEL_SHEET_MAX } from '@/lib/labels/peptsciLabelPdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  batchId: z.string().min(1),
  quantity: z.number().int().min(1).max(PEPTSCI_LABEL_SHEET_MAX).optional(),
  proofMode: z.boolean().optional().default(false),
})

/**
 * POST /api/admin/inventory/labels/pdf
 * Generate a print-ready OL4891LP label sheet (or a single proof) for a batch.
 * Does not change stock — printing labels for received vials is not consumption.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const batch = await getBatch(parsed.data.batchId)
    if (!batch) return errorResponse('Batch not found', 404, 'NOT_FOUND')

    const quantity = parsed.data.proofMode
      ? 1
      : (parsed.data.quantity ?? Math.min(PEPTSCI_LABEL_SHEET_MAX, batch.qtyReceived || 1))

    const pdf = await generatePeptSciLabelSheetPdf({
      productName: batch.productName,
      dose: batch.dose,
      purity: batch.purity,
      batchNumber: batch.batchNumber,
      budIsoDate: batch.bud.toISOString().slice(0, 10),
      accentColor: batch.yearColor || undefined,
      quantity,
      proofMode: parsed.data.proofMode,
    })

    if (!parsed.data.proofMode) {
      await recordLabelPrintEvent(batch.id, quantity, { clerkUserId: userId, label: userId })
    }

    const suffix = parsed.data.proofMode ? '-proof' : ''
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="peptsci-labels-${batch.batchNumber}${suffix}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    logger.error(
      'Error generating labels',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to generate labels')
  }
}
