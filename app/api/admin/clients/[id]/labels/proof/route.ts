import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import {
  ELEVATED_VITALITY_BRAND_KEY,
  generateElevatedVitalityLabelSheetPdf,
} from '@/lib/labels/elevatedVitalityLabelPdf'
import { generateLivbetrLabelSheetPdf } from '@/lib/labels/livbetrLabelPdf'
import { isLabelBrandKey, LIVBETR_BRAND_KEY } from '@/lib/labels/brandKeys'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  productName: z.string().trim().min(1).max(120).optional(),
  dose: z.string().trim().min(1).max(40).optional(),
  batchNumber: z.string().trim().min(1).max(40).optional(),
  budIsoDate: z.string().trim().min(8).max(32).optional(),
  quantity: z.number().int().min(1).max(36).optional(),
  proofMode: z.boolean().optional(),
})

/**
 * POST /api/admin/clients/[id]/labels/proof
 * Generate a sample white-label vial label sheet for the client's brand.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database is not configured', 503, 'NO_DB')

    const { id } = await params
    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true, organizationName: true, labelBrandKey: true, whiteLabelEnabled: true },
    })
    if (!client) return errorResponse('Client not found', 404, 'NOT_FOUND')

    const brandKey = client.labelBrandKey
    if (!isLabelBrandKey(brandKey)) {
      return errorResponse('Select a label brand first.', 400, 'LABEL_BRAND_REQUIRED')
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return errorResponse(parsed.error.errors.map((e) => e.message).join(', '), 400, 'VALIDATION_ERROR')
    }
    const input = parsed.data

    if (brandKey === ELEVATED_VITALITY_BRAND_KEY) {
      const pdf = await generateElevatedVitalityLabelSheetPdf({
        productName: input.productName ?? 'BPC-157 / TB-500',
        dose: input.dose ?? '10mg/10mg',
        batchNumber: input.batchNumber ?? 'BPC-10',
        budIsoDate: input.budIsoDate ?? '2027-07-21',
        quantity: input.quantity ?? 1,
        proofMode: input.proofMode ?? true,
      })
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="elevated-vitality-${client.id}-proof.pdf"`,
          'Cache-Control': 'no-store',
          'X-Label-Brand': brandKey,
        },
      })
    }

    if (brandKey === LIVBETR_BRAND_KEY) {
      const pdf = await generateLivbetrLabelSheetPdf({
        productName: input.productName ?? 'Tesamorelin',
        dose: input.dose ?? '10mg',
        purity: '99%HPLC',
        batchNumber: input.batchNumber ?? 'TES-10',
        budIsoDate: input.budIsoDate ?? '2027-07-21',
        quantity: input.quantity ?? 1,
        proofMode: input.proofMode ?? true,
      })
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="livbetr-${client.id}-proof.pdf"`,
          'Cache-Control': 'no-store',
          'X-Label-Brand': brandKey,
        },
      })
    }

    return errorResponse('Unsupported label brand', 400, 'UNSUPPORTED_BRAND')
  } catch (error) {
    logger.error(
      'Error generating client label proof',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to generate label proof')
  }
}
