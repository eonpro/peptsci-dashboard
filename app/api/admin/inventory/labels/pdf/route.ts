import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  currentActorLabel,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
} from '@/lib/auth'
import { logger } from '@/lib/logger'
import { getBatch, recordLabelPrintEvent } from '@/lib/inventory-batches'
import {
  generatePeptSciLabelSheetPdf,
  PEPTSCI_LABEL_SHEET_MAX,
  resolveLabelDose,
} from '@/lib/labels/peptsciLabelPdf'
import {
  advanceVialLabelSheetCursor,
  getVialLabelSheetStartSlot,
  toOperatorPosition,
} from '@/lib/labels/sheet-cursor'
import { prisma } from '@/lib/prisma'
import {
  bacWaterLabelVolume,
  usesHospiraBacPhoto,
  usesPeptSciBacLabel,
} from '@/lib/shop/bac-water'
import { displayProductName } from '@/lib/products/named-blends'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z
  .object({
    batchId: z.string().min(1).optional(),
    variantId: z.string().min(1).optional(),
    quantity: z.number().int().min(1).max(PEPTSCI_LABEL_SHEET_MAX).optional(),
    proofMode: z.boolean().optional().default(false),
  })
  .refine((d) => Boolean(d.batchId || d.variantId), {
    message: 'batchId or variantId is required',
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

    if (!parsed.data.batchId && parsed.data.variantId) {
      if (!prisma) return errorResponse('Database is not configured', 503, 'NO_DB')
      const variant = await prisma.productVariant.findUnique({
        where: { id: parsed.data.variantId },
        select: { sku: true, dose: true, product: { select: { name: true } } },
      })
      if (!variant) return errorResponse('Product not found', 404, 'NOT_FOUND')
      if (usesHospiraBacPhoto(variant.product.name, variant.dose, variant.sku)) {
        return errorResponse(
          'The Hospira 30mL bottle does not get a PeptSci vial label.',
          400,
          'NO_PEPTSCI_LABEL'
        )
      }
      if (!usesPeptSciBacLabel(variant.product.name, variant.dose, variant.sku)) {
        return errorResponse('Receive a batch before printing labels for this product', 400, 'BATCH_REQUIRED')
      }
      const quantity = parsed.data.proofMode
        ? 1
        : (parsed.data.quantity ?? PEPTSCI_LABEL_SHEET_MAX)
      const startSlot = parsed.data.proofMode ? 0 : await getVialLabelSheetStartSlot()
      const volume = bacWaterLabelVolume(variant.product.name, variant.dose, variant.sku)
      const { pdf, nextStartSlot, labelsPrinted } = await generatePeptSciLabelSheetPdf(
        {
          productName: variant.product.name,
          dose: volume,
          purity: '',
          batchNumber: '',
          budIsoDate: '',
          quantity,
          proofMode: parsed.data.proofMode,
        },
        { startSlot }
      )
      if (!parsed.data.proofMode && labelsPrinted > 0) {
        await advanceVialLabelSheetCursor(startSlot, labelsPrinted)
      }
      const slug = volume.replace(/\s+/g, '').toLowerCase()
      const suffix = parsed.data.proofMode ? '-proof' : ''
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="peptsci-labels-bac-${slug}${suffix}.pdf"`,
          'Cache-Control': 'no-store',
          'X-Label-Start-Position': String(toOperatorPosition(startSlot)),
          'X-Label-Next-Position': String(toOperatorPosition(nextStartSlot)),
          'X-Label-Count': String(labelsPrinted),
        },
      })
    }

    const batch = await getBatch(parsed.data.batchId!)
    if (!batch) return errorResponse('Batch not found', 404, 'NOT_FOUND')

    const quantity = parsed.data.proofMode
      ? 1
      : (parsed.data.quantity ?? Math.min(PEPTSCI_LABEL_SHEET_MAX, batch.qtyReceived || 1))

    // Batch.dose is frozen at intake; empty snapshots (RET0-…) fall back to the
    // live variant dose or SKU (RT5 → 5mg) so the black dose box is never blank.
    const dose = resolveLabelDose(batch.dose, batch.variant?.dose, batch.variant?.sku)
    if (dose && !batch.dose.trim() && prisma) {
      await prisma.inventoryBatch
        .update({ where: { id: batch.id }, data: { dose } })
        .catch(() => {})
    }

    const startSlot = parsed.data.proofMode ? 0 : await getVialLabelSheetStartSlot()
    const { pdf, nextStartSlot, labelsPrinted } = await generatePeptSciLabelSheetPdf(
      {
        productName: displayProductName(batch.productName, batch.variant?.sku),
        dose,
        purity: batch.purity,
        batchNumber: batch.batchNumber,
        budIsoDate: batch.bud.toISOString().slice(0, 10),
        accentColor: batch.yearColor || undefined,
        quantity,
        proofMode: parsed.data.proofMode,
      },
      { startSlot }
    )

    if (!parsed.data.proofMode) {
      await recordLabelPrintEvent(batch.id, quantity, {
        clerkUserId: userId,
        label: await currentActorLabel(userId),
      })
      if (labelsPrinted > 0) {
        await advanceVialLabelSheetCursor(startSlot, labelsPrinted)
      }
    }

    const suffix = parsed.data.proofMode ? '-proof' : ''
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="peptsci-labels-${batch.batchNumber}${suffix}.pdf"`,
        'Cache-Control': 'no-store',
        'X-Label-Start-Position': String(toOperatorPosition(startSlot)),
        'X-Label-Next-Position': String(toOperatorPosition(nextStartSlot)),
        'X-Label-Count': String(labelsPrinted),
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
