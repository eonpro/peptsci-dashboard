'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { ArrowLeft, ImagePlus, Loader2, Trash2, X } from 'lucide-react'

type ArticleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

interface ArticleForm {
  title: string
  slug: string
  excerpt: string
  body: string
  category: string
  coverImageUrl: string
  authorName: string
}

const EMPTY_FORM: ArticleForm = {
  title: '',
  slug: '',
  excerpt: '',
  body: '',
  category: '',
  coverImageUrl: '',
  authorName: '',
}

const STATUS_BADGE: Record<ArticleStatus, string> = {
  PUBLISHED: 'bg-green-500/15 text-green-400 border-green-500/30',
  DRAFT: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  ARCHIVED: 'bg-white/10 text-white/50 border-white/20',
}

export default function ArticleEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const isNew = id === 'new'
  const router = useRouter()

  const [form, setForm] = useState<ArticleForm>(EMPTY_FORM)
  const [status, setStatus] = useState<ArticleStatus>('DRAFT')
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isNew) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/articles/${id}`)
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          toast.error(data.message || 'Failed to load article')
          router.push('/resources')
          return
        }
        const a = data.article
        setForm({
          title: a.title ?? '',
          slug: a.slug ?? '',
          excerpt: a.excerpt ?? '',
          body: a.body ?? '',
          category: a.category ?? '',
          coverImageUrl: a.coverImageUrl ?? '',
          authorName: a.authorName ?? '',
        })
        setStatus(a.status)
      } catch {
        if (!cancelled) {
          toast.error('Failed to load article')
          router.push('/resources')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, isNew, router])

  const set = (field: keyof ArticleForm) => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }))

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await fetch('/api/admin/articles/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || 'Upload failed')
        return
      }
      set('coverImageUrl')(data.url)
      toast.success('Cover image uploaded')
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const save = useCallback(
    async (nextStatus?: ArticleStatus) => {
      if (!form.title.trim()) {
        toast.error('Title is required')
        return
      }
      setSaving(true)
      try {
        if (isNew) {
          const res = await fetch('/api/admin/articles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: form.title,
              slug: form.slug || undefined,
              excerpt: form.excerpt || null,
              body: form.body,
              category: form.category || null,
              coverImageUrl: form.coverImageUrl || null,
              authorName: form.authorName || null,
              publish: nextStatus === 'PUBLISHED',
            }),
          })
          const data = await res.json()
          if (!res.ok) {
            toast.error(data.message || 'Failed to create article')
            return
          }
          toast.success(nextStatus === 'PUBLISHED' ? 'Article published' : 'Draft saved')
          router.push(`/resources/${data.id}`)
        } else {
          const res = await fetch(`/api/admin/articles/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: form.title,
              slug: form.slug || undefined,
              excerpt: form.excerpt || null,
              body: form.body,
              category: form.category || null,
              coverImageUrl: form.coverImageUrl || null,
              authorName: form.authorName || null,
              ...(nextStatus ? { status: nextStatus } : {}),
            }),
          })
          const data = await res.json()
          if (!res.ok) {
            toast.error(data.message || 'Failed to save article')
            return
          }
          setStatus(data.article.status)
          setForm((f) => ({ ...f, slug: data.article.slug }))
          toast.success(
            nextStatus === 'PUBLISHED'
              ? 'Article published'
              : nextStatus === 'DRAFT'
                ? 'Article unpublished'
                : 'Changes saved'
          )
        }
      } catch {
        toast.error('Failed to save article')
      } finally {
        setSaving(false)
      }
    },
    [form, id, isNew, router]
  )

  const remove = async () => {
    try {
      const res = await fetch(`/api/admin/articles/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || 'Failed to delete article')
        return
      }
      toast.success('Article deleted')
      router.push('/resources')
    } catch {
      toast.error('Failed to delete article')
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/resources" aria-label="Back to resources">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold tracking-tight">
                {isNew ? 'New Article' : 'Edit Article'}
              </h2>
              {!isNew && (
                <Badge variant="outline" className={STATUS_BADGE[status]}>
                  {status}
                </Badge>
              )}
            </div>
            {!isNew && form.slug && (
              <p className="text-sm text-muted-foreground">/shop/resources/{form.slug}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this article?</AlertDialogTitle>
                  <AlertDialogDescription>
                    &ldquo;{form.title}&rdquo; will be permanently removed from the client portal.
                    This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={remove}
                    className="bg-red-600 text-white hover:bg-red-700"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button variant="outline" onClick={() => save()} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isNew ? 'Save Draft' : 'Save'}
          </Button>
          {status === 'PUBLISHED' ? (
            <Button variant="secondary" onClick={() => save('DRAFT')} disabled={saving}>
              Unpublish
            </Button>
          ) : (
            <Button onClick={() => save('PUBLISHED')} disabled={saving}>
              Publish
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => set('title')(e.target.value)}
              placeholder="e.g. GLP-1 research: what the current literature says"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={form.slug}
              onChange={(e) => set('slug')(e.target.value)}
              placeholder="auto-generated from title"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              value={form.category}
              onChange={(e) => set('category')(e.target.value)}
              placeholder="e.g. GLP-1, Dosing, Research"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="author">Author</Label>
            <Input
              id="author"
              value={form.authorName}
              onChange={(e) => set('authorName')(e.target.value)}
              placeholder="e.g. PeptSci Research Team"
            />
          </div>
          <div className="space-y-2">
            <Label>Cover image</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleUpload(file)
                e.target.value = ''
              }}
            />
            {form.coverImageUrl ? (
              <div className="relative w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={form.coverImageUrl}
                  alt="Cover"
                  className="h-24 w-40 rounded-lg border border-white/10 object-cover"
                />
                <button
                  type="button"
                  onClick={() => set('coverImageUrl')('')}
                  className="absolute -right-2 -top-2 rounded-full bg-red-600 p-1 text-white hover:bg-red-700"
                  aria-label="Remove cover image"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="mr-2 h-4 w-4" />
                )}
                Upload image
              </Button>
            )}
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="excerpt">Excerpt</Label>
            <Textarea
              id="excerpt"
              value={form.excerpt}
              onChange={(e) => set('excerpt')(e.target.value)}
              placeholder="Short teaser shown on the article card (1-2 sentences)"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Body (markdown)</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="write">
            <TabsList>
              <TabsTrigger value="write">Write</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="write">
              <Textarea
                value={form.body}
                onChange={(e) => set('body')(e.target.value)}
                placeholder={'## Section heading\n\nWrite the article body in markdown...'}
                rows={22}
                className="font-mono text-sm"
              />
            </TabsContent>
            <TabsContent value="preview">
              <div className="min-h-[300px] rounded-lg border border-white/10 bg-white/5 p-6">
                {form.body.trim() ? (
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => (
                        <h1 className="mb-4 mt-8 text-2xl font-semibold first:mt-0">{children}</h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="mb-3 mt-8 text-xl font-semibold first:mt-0">{children}</h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="mb-2 mt-6 text-lg font-semibold first:mt-0">{children}</h3>
                      ),
                      p: ({ children }) => (
                        <p className="mb-4 text-sm leading-relaxed text-white/80 last:mb-0">
                          {children}
                        </p>
                      ),
                      ul: ({ children }) => (
                        <ul className="mb-4 list-disc space-y-1.5 pl-5 text-sm text-white/80">
                          {children}
                        </ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-sm text-white/80">
                          {children}
                        </ol>
                      ),
                      a: ({ href, children }) => (
                        <a href={href} className="text-[#8b95ff] hover:underline">
                          {children}
                        </a>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold text-white">{children}</strong>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="mb-4 border-l-2 border-brand-primary/60 pl-4 text-sm italic text-white/70">
                          {children}
                        </blockquote>
                      ),
                    }}
                  >
                    {form.body}
                  </ReactMarkdown>
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
