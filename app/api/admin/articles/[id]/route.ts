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
import { slugify, computeReadTimeMinutes } from '@/lib/articles'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/articles/[id]
 * Fetch a single article (any status) for the editor. Admin only.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const article = await prisma.article.findUnique({ where: { id } })
    if (!article) return errorResponse('Article not found', 404, 'NOT_FOUND')

    return successResponse({ article })
  } catch (error) {
    logger.error(
      'Error fetching article',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to fetch article')
  }
}

const updateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  slug: z.string().trim().min(1).optional(),
  excerpt: z.string().trim().nullable().optional(),
  body: z.string().optional(),
  category: z.string().trim().nullable().optional(),
  coverImageUrl: z.string().trim().nullable().optional(),
  authorName: z.string().trim().nullable().optional(),
  // DRAFT -> PUBLISHED sets publishedAt (first publish only); ARCHIVED hides it.
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
})

/**
 * PATCH /api/admin/articles/[id]
 * Update article fields and/or publish state. Admin only.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const current = await prisma.article.findUnique({
      where: { id },
      select: { id: true, publishedAt: true },
    })
    if (!current) return errorResponse('Article not found', 404, 'NOT_FOUND')

    const parsed = updateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const data = parsed.data

    let slug: string | undefined
    if (data.slug !== undefined) {
      slug = slugify(data.slug)
      if (!slug) return errorResponse('Invalid slug', 400, 'VALIDATION_ERROR')
      const clash = await prisma.article.findUnique({ where: { slug }, select: { id: true } })
      if (clash && clash.id !== id) {
        return errorResponse(`An article with slug "${slug}" already exists`, 409, 'DUPLICATE_SLUG')
      }
    }

    const article = await prisma.article.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(slug !== undefined ? { slug } : {}),
        ...(data.excerpt !== undefined ? { excerpt: data.excerpt || null } : {}),
        ...(data.body !== undefined
          ? { body: data.body, readTimeMinutes: computeReadTimeMinutes(data.body) }
          : {}),
        ...(data.category !== undefined ? { category: data.category || null } : {}),
        ...(data.coverImageUrl !== undefined ? { coverImageUrl: data.coverImageUrl || null } : {}),
        ...(data.authorName !== undefined ? { authorName: data.authorName || null } : {}),
        ...(data.status !== undefined
          ? {
              status: data.status,
              ...(data.status === 'PUBLISHED' && !current.publishedAt
                ? { publishedAt: new Date() }
                : {}),
            }
          : {}),
      },
    })

    logger.info('Article updated', { articleId: id, status: article.status, by: userId })
    return successResponse({ article })
  } catch (error) {
    logger.error(
      'Error updating article',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to update article')
  }
}

/**
 * DELETE /api/admin/articles/[id]
 * Permanently delete an article. Admin only.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const existing = await prisma.article.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return errorResponse('Article not found', 404, 'NOT_FOUND')

    await prisma.article.delete({ where: { id } })

    logger.info('Article deleted', { articleId: id, by: userId })
    return successResponse({ deleted: true })
  } catch (error) {
    logger.error(
      'Error deleting article',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to delete article')
  }
}
