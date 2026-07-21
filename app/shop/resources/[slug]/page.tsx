import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ArticleBody } from '@/components/shop/ArticleBody'
import { getPublishedArticleBySlug } from '@/lib/articles'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const article = await getPublishedArticleBySlug(slug)
  if (!article) return { title: 'Resources | PeptSci' }
  return {
    title: `${article.title} | PeptSci Resources`,
    description: article.excerpt ?? undefined,
  }
}

function formatDate(value: Date | null): string | null {
  if (!value) return null
  return value.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = await getPublishedArticleBySlug(slug)
  if (!article) notFound()

  const publishedDate = formatDate(article.publishedAt)

  return (
    <article className="mx-auto max-w-3xl space-y-8">
      {/* Back link */}
      <Link
        href="/shop/resources"
        className="inline-flex items-center gap-2 text-sm font-medium text-white/50 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        All resources
      </Link>

      {/* Header */}
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
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
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl">
          {article.title}
        </h1>
        {(article.authorName || publishedDate) && (
          <p className="text-sm text-white/45">
            {article.authorName && <span className="text-white/60">{article.authorName}</span>}
            {article.authorName && publishedDate && <span aria-hidden> · </span>}
            {publishedDate}
          </p>
        )}
      </header>

      {/* Cover image */}
      {article.coverImageUrl && (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={article.coverImageUrl} alt="" className="aspect-[16/9] w-full object-cover" />
        </div>
      )}

      {/* Body */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-10">
        <ArticleBody markdown={article.body} />
      </div>

      {/* Disclaimer */}
      <p className="text-xs leading-relaxed text-white/35">
        This content is provided for informational and educational purposes only and is not
        medical advice. Products referenced are intended for research use only and are not
        approved for human consumption, diagnosis, treatment, or prevention of any disease.
      </p>
    </article>
  )
}
