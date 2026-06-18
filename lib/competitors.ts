/**
 * Competitor price comparison, sourced from Postgres (CompetitorPrice).
 * Replaces the former Google Sheets "Competitor Comparison" tab. The
 * `Competitor` shape is preserved so the competitors page/table/chart are
 * unchanged. Populated via CSV upload (/api/admin/competitors/import).
 */

import { prisma } from './prisma'
import { logger } from './logger'

export interface Competitor {
  Competitor: string
  Product: string
  Dose: string
  TheirPrice: number
  OurSRP: number
  Diff?: number
}

export async function getCompetitors(): Promise<Competitor[]> {
  if (!prisma) return []
  try {
    const rows = await prisma.competitorPrice.findMany({
      orderBy: [{ productName: 'asc' }, { competitorName: 'asc' }],
    })
    return rows.map((r) => {
      const theirPrice = Number(r.theirPrice)
      const ourSrp = Number(r.ourSrp)
      return {
        Competitor: r.competitorName,
        Product: r.productName,
        Dose: r.dose,
        TheirPrice: theirPrice,
        OurSRP: ourSrp,
        Diff: r.diff != null ? Number(r.diff) : ourSrp - theirPrice,
      }
    })
  } catch (error) {
    logger.error(
      'Error fetching competitors',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return []
  }
}
