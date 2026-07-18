import { NextRequest, NextResponse } from 'next/server'
import { getSales } from '@/lib/sales'
import { getInventory } from '@/lib/inventory'
import { getPriceSheet } from '@/lib/pricing'
import { globalSearch, type SearchResult } from '@/lib/search'
import { prisma } from '@/lib/prisma'
import { requireAdmin, unauthorizedResponse, forbiddenResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { z } from 'zod'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic' // Use dynamic rendering for authenticated routes

const searchQuerySchema = z.object({
  q: z.string().min(2, 'Query must be at least 2 characters').max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

/**
 * Postgres-backed search across ops entities the legacy sheet search doesn't
 * cover: clients, invoices, returns (RMA), and partner orgs.
 */
async function searchDatabase(query: string): Promise<SearchResult[]> {
  if (!prisma) return []
  const take = 5
  const contains = { contains: query, mode: 'insensitive' as const }
  const asNumber = Number(query.replace(/^#|^inv-?/i, ''))
  const numeric = Number.isInteger(asNumber) && asNumber > 0 ? asNumber : null

  try {
    const [clients, invoices, returns, partners] = await Promise.all([
      prisma.client.findMany({
        where: {
          OR: [
            { organizationName: contains },
            { contactName: contains },
            { contactEmail: contains },
            { npiNumber: contains },
          ],
        },
        select: { id: true, organizationName: true, contactEmail: true, contactName: true },
        take,
      }),
      numeric
        ? prisma.invoice.findMany({
            where: { invoiceNumber: numeric },
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
              client: { select: { organizationName: true } },
            },
            take,
          })
        : prisma.invoice.findMany({
            where: { client: { organizationName: contains } },
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
              client: { select: { organizationName: true } },
            },
            orderBy: { invoiceNumber: 'desc' },
            take,
          }),
      prisma.returnRequest.findMany({
        where: {
          OR: [
            { rmaNumber: contains },
            { client: { organizationName: contains } },
          ],
        },
        select: {
          id: true,
          rmaNumber: true,
          status: true,
          client: { select: { organizationName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      prisma.partnerOrg.findMany({
        where: {
          OR: [{ name: contains }, { contactEmail: contains }, { contactName: contains }],
        },
        select: { id: true, name: true, status: true, contactEmail: true },
        take,
      }),
    ])

    return [
      ...clients.map(
        (c): SearchResult => ({
          type: 'client',
          id: c.id,
          title: c.organizationName,
          subtitle: [c.contactName, c.contactEmail].filter(Boolean).join(' · '),
          href: `/clients/${c.id}`,
        })
      ),
      ...invoices.map(
        (i): SearchResult => ({
          type: 'invoice',
          id: i.id,
          title: `INV-${String(i.invoiceNumber).padStart(5, '0')}`,
          subtitle: `${i.client?.organizationName ?? 'Unknown client'} · ${i.status}`,
          href: `/invoices/${i.id}`,
        })
      ),
      ...returns.map(
        (r): SearchResult => ({
          type: 'return',
          id: r.id,
          title: r.rmaNumber,
          subtitle: `${r.client?.organizationName ?? 'Unknown client'} · ${r.status}`,
          href: `/returns/${r.id}`,
        })
      ),
      ...partners.map(
        (p): SearchResult => ({
          type: 'partner',
          id: p.id,
          title: p.name,
          subtitle: `${p.contactEmail} · ${p.status}`,
          href: `/partners-admin/${p.id}`,
        })
      ),
    ]
  } catch (error) {
    logger.error('DB search failed', {}, error instanceof Error ? error : new Error(String(error)))
    return []
  }
}

export async function GET(request: NextRequest) {
  try {
    // Authenticate + authorize: global search spans sales/inventory/pricing
    // (admin ops data), so it is admin-only.
    const { userId, isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) {
      return unauthorizedResponse()
    }
    if (!isAdmin) {
      return forbiddenResponse()
    }

    // Rate limit check
    const rateLimitKey = getRateLimitKey(request, userId)
    const { limited, remaining, retryAfter } = await checkRateLimit(rateLimitKey, RATE_LIMITS.standard)

    if (limited) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        {
          status: 429,
          headers: getRateLimitHeaders(remaining, RATE_LIMITS.standard, retryAfter),
        }
      )
    }

    // Validate query parameters
    const searchParams = request.nextUrl.searchParams
    const parseResult = searchQuerySchema.safeParse({
      q: searchParams.get('q'),
      limit: searchParams.get('limit'),
    })

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: parseResult.error.errors.map((e) => e.message).join(', '),
          code: 'VALIDATION_ERROR',
        },
        { status: 400 }
      )
    }

    const { q: query, limit } = parseResult.data

    logger.info('Search request', { query, limit, userId })

    // Fetch data in parallel
    const [sales, inventory, prices, dbResults] = await Promise.all([
      getSales(),
      getInventory(),
      getPriceSheet(),
      searchDatabase(query),
    ])

    // Perform search
    const results = [...globalSearch(query, { sales, inventory, prices }, limit), ...dbResults]

    logger.info('Search completed', { query, resultCount: results.length })

    return successResponse({
      query,
      count: results.length,
      results,
    })
  } catch (error) {
    logger.error('Search error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to perform search')
  }
}
