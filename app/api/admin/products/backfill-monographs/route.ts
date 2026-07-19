import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getMonographForName } from '@/lib/content/peptide-monographs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Admin-only monograph backfill.
 *
 * Why this exists: production connects to RDS using short-lived IAM auth tokens
 * minted at runtime (see lib/db-url.ts), and the scripts/ CLI backfill can't
 * use that auth from outside the Vercel runtime. This route runs the same
 * name-keyed monograph upsert through the live (already-authenticated) runtime
 * connection.
 *
 * Behavior:
 *  - GET:  dry-run. Reports which products would be updated and which have no
 *          monograph match. No writes.
 *  - POST: requires { confirm: true }. Writes the authored monograph JSON (and
 *          a default purity of "99%" when none is set) to matched products.
 *
 * Idempotent: re-running overwrites the monograph with the current authored
 * version. SUPER_ADMIN only.
 */

const DEFAULT_PURITY = '99%'

async function loadProducts() {
  if (!prisma) throw new Error('Database is not configured')
  return prisma.product.findMany({
    select: { id: true, name: true, purity: true },
    orderBy: { name: 'asc' },
  })
}

function summarize(products: { name: string }[]) {
  const matched: string[] = []
  const unmatched: string[] = []
  for (const p of products) {
    if (getMonographForName(p.name)) matched.push(p.name)
    else unmatched.push(p.name)
  }
  return { matched, unmatched }
}

export async function GET() {
  const { isAuthenticated, isAdmin } = await requireSuperAdmin()
  if (!isAuthenticated) return unauthorizedResponse()
  if (!isAdmin) return forbiddenResponse('Super-admin access required')

  try {
    const products = await loadProducts()
    const { matched, unmatched } = summarize(products)
    return successResponse({
      dryRun: true,
      scanned: products.length,
      wouldUpdate: matched.length,
      matched,
      unmatched,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backfill preview failed'
    logger.error('[MONOGRAPH BACKFILL] preview error', { message })
    return errorResponse(message)
  }
}

export async function POST(request: NextRequest) {
  const { isAuthenticated, isAdmin, userId } = await requireSuperAdmin()
  if (!isAuthenticated) return unauthorizedResponse()
  if (!isAdmin) return forbiddenResponse('Super-admin access required')

  const body = (await request.json().catch(() => ({}))) as { confirm?: boolean }
  if (body?.confirm !== true) {
    return errorResponse('Confirmation required: POST { "confirm": true }', 400, 'CONFIRM_REQUIRED')
  }

  if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')

  const start = Date.now()
  try {
    const products = await loadProducts()
    let updated = 0
    const unmatched: string[] = []

    for (const p of products) {
      const monograph = getMonographForName(p.name)
      if (!monograph) {
        unmatched.push(p.name)
        continue
      }
      await prisma.product.update({
        where: { id: p.id },
        data: {
          monograph: monograph as unknown as Prisma.InputJsonValue,
          ...(p.purity ? {} : { purity: DEFAULT_PURITY }),
        },
      })
      updated += 1
    }

    logger.info('[MONOGRAPH BACKFILL] run complete', {
      by: userId,
      scanned: products.length,
      updated,
      unmatched: unmatched.length,
      durationMs: Date.now() - start,
    })

    return successResponse({
      success: true,
      scanned: products.length,
      updated,
      unmatched,
      durationMs: Date.now() - start,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backfill failed'
    logger.error('[MONOGRAPH BACKFILL] error', { message })
    return errorResponse(message)
  }
}
