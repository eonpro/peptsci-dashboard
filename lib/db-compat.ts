/**
 * Detect Prisma/Postgres errors from selecting columns that have not been
 * migrated yet (e.g. Client.shippingRateTwoDay before Settings → migrate).
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export function isMissingDbColumnError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2022') return true
  const msg = err instanceof Error ? err.message : String(err)
  return /column .+ does not exist/i.test(msg) || /does not exist in the current database/i.test(msg)
}

export const EMPTY_CLIENT_SHIPPING_RATES = {
  shippingRateTwoDay: null as number | null,
  shippingRateOvernight: null as number | null,
}

/**
 * Load practice shipping rates without requiring the Prisma select path.
 * Returns nulls when the migration has not been applied yet.
 */
export async function loadClientShippingRates(clientId: string): Promise<{
  shippingRateTwoDay: number | null
  shippingRateOvernight: number | null
}> {
  if (!prisma) return EMPTY_CLIENT_SHIPPING_RATES
  try {
    const rows = await prisma.$queryRaw<
      Array<{ shippingRateTwoDay: unknown; shippingRateOvernight: unknown }>
    >`
      SELECT "shippingRateTwoDay", "shippingRateOvernight"
      FROM "Client"
      WHERE id = ${clientId}
    `
    const row = rows[0]
    if (!row) return EMPTY_CLIENT_SHIPPING_RATES
    return {
      shippingRateTwoDay: row.shippingRateTwoDay != null ? Number(row.shippingRateTwoDay) : null,
      shippingRateOvernight:
        row.shippingRateOvernight != null ? Number(row.shippingRateOvernight) : null,
    }
  } catch (err) {
    if (isMissingDbColumnError(err)) return EMPTY_CLIENT_SHIPPING_RATES
    throw err
  }
}
