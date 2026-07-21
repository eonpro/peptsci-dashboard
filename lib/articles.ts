/**
 * Shared helpers for the client-portal Resources article hub.
 *
 * Articles are authored from the admin dashboard (markdown body stored in
 * Postgres) and rendered inside the gated client portal at /shop/resources.
 * Server-only (imports prisma).
 */

import { prisma } from '@/lib/prisma'
import type { Article } from '@prisma/client'

export const ARTICLES_PAGE_SIZE = 12

/** Average adult reading speed used for the "X MIN READ" badge. */
const WORDS_PER_MINUTE = 200

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
}

export function computeReadTimeMinutes(body: string): number {
  const words = body.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))
}

export type PublishedArticleCard = Pick<
  Article,
  | 'id'
  | 'slug'
  | 'title'
  | 'excerpt'
  | 'category'
  | 'coverImageUrl'
  | 'readTimeMinutes'
  | 'publishedAt'
  | 'authorName'
>

export async function getPublishedArticles(options: {
  category?: string
  page?: number
  pageSize?: number
}): Promise<{ articles: PublishedArticleCard[]; total: number; categories: string[] }> {
  if (!prisma) return { articles: [], total: 0, categories: [] }

  const pageSize = options.pageSize ?? ARTICLES_PAGE_SIZE
  const page = Math.max(1, options.page ?? 1)
  const where = {
    status: 'PUBLISHED' as const,
    ...(options.category ? { category: options.category } : {}),
  }

  const [articles, total, categoryRows] = await Promise.all([
    prisma.article.findMany({
      where,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        category: true,
        coverImageUrl: true,
        readTimeMinutes: true,
        publishedAt: true,
        authorName: true,
      },
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.article.count({ where }),
    prisma.article.findMany({
      where: { status: 'PUBLISHED', category: { not: null } },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    }),
  ])

  return {
    articles,
    total,
    categories: categoryRows.map((r) => r.category).filter((c): c is string => !!c),
  }
}

export async function getPublishedArticleBySlug(slug: string): Promise<Article | null> {
  if (!prisma) return null
  return prisma.article.findFirst({ where: { slug, status: 'PUBLISHED' } })
}
