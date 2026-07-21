import { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { getPublishedArticles, ARTICLES_PAGE_SIZE } from '@/lib/articles'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Resources | PeptSci',
  description: 'Peptide research articles, dosing references, and educational guides',
}

export const dynamic = 'force-dynamic'

/** Preserve category + page in pagination/filter links. */
function buildHref(category: string | undefined, page: number): string {
  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/shop/resources?${qs}` : '/shop/resources'
}

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }>
}) {
  const { category, page: pageParam } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)

  const { articles, total, categories } = await getPublishedArticles({ category, page })
  const totalPages = Math.max(1, Math.ceil(total / ARTICLES_PAGE_SIZE))

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="max-w-3xl space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Resources</h1>
        <p className="text-[15px] leading-relaxed text-white/60">
          Research summaries, dosing references, and educational guides on the peptides in our
          catalog — written to help your practice stay current with the published literature.
        </p>
      </div>

      {/* Category filter pills */}
      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={buildHref(undefined, 1)}
            className={cn(
              'rounded-full border px-4 py-1.5 text-sm font-medium transition-all',
              !category
                ? 'border-brand-primary bg-brand-primary text-white'
                : 'border-white/15 text-white/60 hover:border-white/30 hover:text-white'
            )}
          >
            All
          </Link>
          {categories.map((c) => (
            <Link
              key={c}
              href={buildHref(c, 1)}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-medium transition-all',
                category === c
                  ? 'border-brand-primary bg-brand-primary text-white'
                  : 'border-white/15 text-white/60 hover:border-white/30 hover:text-white'
              )}
            >
              {c}
            </Link>
          ))}
        </div>
      )}

      {/* Article grid */}
      {articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 py-20 text-center">
          <BookOpen className="h-10 w-10 text-white/30" />
          <p className="font-medium text-white">No articles yet</p>
          <p className="max-w-sm text-sm text-white/50">
            {category
              ? 'No published articles in this category. Try another one.'
              : 'Educational content is on the way — check back soon.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/shop/resources/${article.slug}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition-all hover:border-brand-primary/50 hover:bg-white/[0.08]"
            >
              {/* Cover */}
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#0a0e3a]">
                {article.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={article.coverImageUrl}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-brand-primary/20 via-[#0a0e3a] to-[#3b2a8c]/30">
                    <BookOpen className="h-10 w-10 text-white/20" />
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex items-center gap-2">
                  {article.category && (
                    <Badge
                      variant="outline"
                      className="border-brand-primary/40 bg-brand-primary/10 text-[10px] uppercase tracking-wide text-[#8b95ff]"
                    >
                      {article.category}
                    </Badge>
                  )}
                  {article.readTimeMinutes && (
                    <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-white/40">
                      <Clock className="h-3 w-3" />
                      {article.readTimeMinutes} min read
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-semibold leading-snug text-white transition-colors group-hover:text-[#a7b0ff]">
                  {article.title}
                </h2>
                {article.excerpt && (
                  <p className="line-clamp-3 text-sm leading-relaxed text-white/55">
                    {article.excerpt}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={buildHref(category, p)}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-medium transition-all',
                p === page
                  ? 'border-brand-primary bg-brand-primary text-white'
                  : 'border-white/15 text-white/60 hover:border-white/30 hover:text-white'
              )}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
