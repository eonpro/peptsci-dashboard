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
 * GET /api/admin/articles
 * List all articles (any status) for the admin Resources table. Admin only.
 */
export async function GET(_request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return successResponse({ articles: [] })

    const articles = await prisma.article.findMany({
      select: {
        id: true,
        slug: true,
        title: true,
        category: true,
        status: true,
        readTimeMinutes: true,
        publishedAt: true,
        authorName: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    return successResponse({ articles })
  } catch (error) {
    logger.error(
      'Error listing articles',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to list articles')
  }
}

const createSchema = z.object({
  title: z.string().trim().min(1, 'title is required'),
  slug: z.string().trim().optional(),
  excerpt: z.string().trim().nullable().optional(),
  body: z.string().default(''),
  category: z.string().trim().nullable().optional(),
  coverImageUrl: z.string().trim().nullable().optional(),
  authorName: z.string().trim().nullable().optional(),
  publish: z.boolean().default(false),
})

/**
 * POST /api/admin/articles
 * Create an article. Slug is auto-generated from the title when omitted;
 * read time is computed from the body word count. Admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')

    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const data = parsed.data

    const slug = slugify(data.slug || data.title)
    if (!slug) return errorResponse('Could not derive a slug from the title', 400, 'VALIDATION_ERROR')

    const existing = await prisma.article.findUnique({ where: { slug }, select: { id: true } })
    if (existing) {
      return errorResponse(`An article with slug "${slug}" already exists`, 409, 'DUPLICATE_SLUG')
    }

    const article = await prisma.article.create({
      data: {
        slug,
        title: data.title,
        excerpt: data.excerpt || null,
        body: data.body,
        category: data.category || null,
        coverImageUrl: data.coverImageUrl || null,
        authorName: data.authorName || null,
        readTimeMinutes: computeReadTimeMinutes(data.body),
        status: data.publish ? 'PUBLISHED' : 'DRAFT',
        publishedAt: data.publish ? new Date() : null,
      },
      select: { id: true, slug: true },
    })

    logger.info('Article created', { articleId: article.id, slug, by: userId })
    return successResponse({ id: article.id, slug: article.slug }, 201)
  } catch (error) {
    logger.error(
      'Error creating article',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to create article')
  }
}
