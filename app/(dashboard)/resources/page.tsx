'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { BookOpen, Plus } from 'lucide-react'

interface ArticleRow {
  id: string
  slug: string
  title: string
  category: string | null
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  readTimeMinutes: number | null
  publishedAt: string | null
  authorName: string | null
  updatedAt: string
}

const STATUS_BADGE: Record<ArticleRow['status'], string> = {
  PUBLISHED: 'bg-green-500/15 text-green-400 border-green-500/30',
  DRAFT: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  ARCHIVED: 'bg-white/10 text-white/50 border-white/20',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function AdminResourcesPage() {
  const router = useRouter()
  const [articles, setArticles] = useState<ArticleRow[] | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/articles')
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || 'Failed to load articles')
        setArticles([])
        return
      }
      setArticles(data.articles)
    } catch {
      toast.error('Failed to load articles')
      setArticles([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Resources</h2>
          <p className="text-muted-foreground">
            Educational articles shown to clinics in the client portal
          </p>
        </div>
        <Button asChild>
          <Link href="/resources/new">
            <Plus className="mr-2 h-4 w-4" />
            New Article
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {articles === null ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : articles.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <BookOpen className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">No articles yet</p>
                <p className="text-sm text-muted-foreground">
                  Create your first article to populate the client Resources hub.
                </p>
              </div>
              <Button asChild size="sm">
                <Link href="/resources/new">
                  <Plus className="mr-2 h-4 w-4" />
                  New Article
                </Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Read time</TableHead>
                  <TableHead className="hidden md:table-cell">Published</TableHead>
                  <TableHead className="hidden lg:table-cell">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {articles.map((article) => (
                  <TableRow
                    key={article.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/resources/${article.id}`)}
                  >
                    <TableCell>
                      <div className="font-medium">{article.title}</div>
                      <div className="text-xs text-muted-foreground">/{article.slug}</div>
                    </TableCell>
                    <TableCell>
                      {article.category ? (
                        <Badge variant="outline">{article.category}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE[article.status]}>
                        {article.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {article.readTimeMinutes ? `${article.readTimeMinutes} min` : '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {formatDate(article.publishedAt)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {formatDate(article.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
