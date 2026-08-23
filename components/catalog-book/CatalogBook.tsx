'use client'

import {
  Children,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import type { BookPageMeta } from '@/lib/catalog-book'
import { CATALOG_YEAR } from '@/lib/catalog-book'

interface CatalogBookProps {
  pages: BookPageMeta[]
  children: ReactNode
}

function padPage(n: number) {
  return String(n).padStart(2, '0')
}

/**
 * Full-bleed catalog pager: one page at a time, hash deep links, searchable
 * TOC, keyboard + swipe. Page bodies are server-rendered and passed in so the
 * labeled vials match the shop without shipping catalog data to the client.
 */
export function CatalogBook({ pages, children }: CatalogBookProps) {
  const pagesContent = Children.toArray(children)
  const total = pages.length
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState<'fwd' | 'back'>('fwd')
  const [tocOpen, setTocOpen] = useState(false)
  const [tocQuery, setTocQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const hashSynced = useRef(false)

  const clamp = useCallback((i: number) => Math.min(Math.max(i, 0), Math.max(total - 1, 0)), [total])

  const goTo = useCallback(
    (i: number) => {
      setIndex((prev) => {
        const nextIndex = clamp(i)
        if (nextIndex !== prev) setDirection(nextIndex > prev ? 'fwd' : 'back')
        return nextIndex
      })
    },
    [clamp]
  )
  const next = useCallback(() => {
    setDirection('fwd')
    setIndex((i) => clamp(i + 1))
  }, [clamp])
  const prev = useCallback(() => {
    setDirection('back')
    setIndex((i) => clamp(i - 1))
  }, [clamp])

  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (!id) {
      hashSynced.current = true
      return
    }
    const target = pages.findIndex((p) => p.id === id)
    if (target >= 0) setIndex(target)
    hashSynced.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hashSynced.current) return
    const id = pages[index]?.id
    if (!id) return
    if (window.location.hash.slice(1) !== id) {
      history.replaceState(null, '', `#${id}`)
    }
    stageRef.current?.scrollTo({ top: 0 })
  }, [index, pages])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tocOpen) {
        if (e.key === 'Escape') setTocOpen(false)
        return
      }
      if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'Home') goTo(0)
      else if (e.key === 'End') goTo(total - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, goTo, total, tocOpen])

  const tocGroups = useMemo(() => {
    const needle = tocQuery.trim().toLowerCase()
    const groups: { group: string; entries: { label: string; index: number }[] }[] = []
    pages.forEach((page, i) => {
      if (!page.tocLabel) return
      if (needle && !page.tocLabel.toLowerCase().includes(needle)) return
      const groupName = page.tocGroup ?? 'Pages'
      let bucket = groups.find((g) => g.group === groupName)
      if (!bucket) {
        bucket = { group: groupName, entries: [] }
        groups.push(bucket)
      }
      bucket.entries.push({ label: page.tocLabel, index: i })
    })
    return groups
  }, [pages, tocQuery])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }, [])

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStart.current
      touchStart.current = null
      if (!start) return
      const t = e.changedTouches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
      if (dx < 0) next()
      else prev()
    },
    [next, prev]
  )

  const onStageClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      const goto = target.closest('[data-book-goto]')?.getAttribute('data-book-goto')
      if (goto) {
        const i = pages.findIndex((p) => p.id === goto)
        if (i >= 0) goTo(i)
        return
      }
      if (target.closest('[data-book-next]')) next()
    },
    [goTo, next, pages]
  )

  async function copyShareLink() {
    const id = pages[index]?.id
    const url = `${window.location.origin}/catalog${id ? `#${id}` : ''}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  const current = pages[index]
  const nextLabel = pages[index + 1]?.tocLabel
  const prevLabel = pages[index - 1]?.tocLabel
  const progress = total === 0 ? 0 : ((index + 1) / total) * 100

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-brand-onyx">
      <header className="relative z-20 flex items-center justify-between gap-3 border-b border-white/8 bg-brand-onyx/80 px-4 py-2.5 backdrop-blur-xl sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/65 transition-colors hover:text-white"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M12.7 4.3a1 1 0 0 1 0 1.4L8.42 10l4.3 4.3a1 1 0 0 1-1.42 1.4l-5-5a1 1 0 0 1 0-1.4l5-5a1 1 0 0 1 1.4 0Z"
              clipRule="evenodd"
            />
          </svg>
          Home
        </Link>

        <div className="min-w-0 flex-1 text-center" aria-live="polite">
          {current?.tocGroup && (
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.28em] text-white/40">
              {current.tocGroup}
            </p>
          )}
          <p className="truncate text-sm font-semibold uppercase tracking-[0.16em] text-white">
            {current?.tocLabel ?? `${CATALOG_YEAR} Catalog`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setTocQuery('')
              setTocOpen(true)
            }}
            className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white transition-all hover:border-white/25 hover:bg-white/14"
          >
            Contents
          </button>
          <button
            type="button"
            onClick={() => void copyShareLink()}
            className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white transition-all hover:brightness-110 active:scale-95"
          >
            {copied ? 'Copied' : 'Share'}
          </button>
        </div>
      </header>

      <div className="relative z-20 h-[2px] bg-white/8">
        <div
          className="h-full bg-brand-primary transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div
        ref={stageRef}
        className="relative min-h-0 flex-1 overflow-y-auto"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={onStageClick}
      >
        <div className="flex min-h-full w-full flex-col">
          {pagesContent.map((page, i) => {
            if (Math.abs(i - index) > 1) return null
            return (
              <div
                key={pages[i]?.id ?? i}
                hidden={i !== index}
                className={
                  i === index
                    ? `flex min-h-full flex-1 flex-col [&_>_div]:min-h-full [&_>_div]:flex-1 ${
                        direction === 'fwd' ? 'animate-book-in-right' : 'animate-book-in-left'
                      }`
                    : undefined
                }
              >
                {page}
              </div>
            )
          })}
        </div>

        <nav
          aria-label="Pages"
          className="pointer-events-none absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 flex-col items-center gap-1.5 lg:flex"
        >
          {pages.map((p, i) => (
            <button
              key={p.id}
              type="button"
              title={p.tocLabel}
              aria-label={`Go to page ${i + 1}${p.tocLabel ? ` — ${p.tocLabel}` : ''}`}
              aria-current={i === index ? 'page' : undefined}
              onClick={() => goTo(i)}
              className={`pointer-events-auto rounded-full transition-all duration-300 ${
                i === index
                  ? 'h-7 w-1.5 bg-brand-primary shadow-[0_0_12px_rgba(33,60,239,0.8)]'
                  : 'h-1.5 w-1.5 bg-white/30 hover:scale-150 hover:bg-white'
              }`}
            />
          ))}
        </nav>
      </div>

      <footer className="relative z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-white/8 bg-brand-onyx/85 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="flex items-center justify-end gap-3">
          <span className="hidden max-w-[220px] truncate text-right text-xs text-white/40 md:block">
            {prevLabel}
          </span>
          <button
            type="button"
            onClick={prev}
            disabled={index <= 0}
            aria-label="Previous page"
            className="flex h-12 w-12 flex-none items-center justify-center rounded-full border border-white/12 bg-white/8 text-white transition-all hover:border-white/25 hover:bg-white/16 active:scale-95 disabled:cursor-not-allowed disabled:opacity-25"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M12.7 4.3a1 1 0 0 1 0 1.4L8.42 10l4.3 4.3a1 1 0 0 1-1.42 1.4l-5-5a1 1 0 0 1 0-1.4l5-5a1 1 0 0 1 1.4 0Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        <span
          aria-live="polite"
          className="min-w-[7rem] text-center text-xs font-semibold uppercase tracking-[0.22em] tabular-nums text-white/80"
        >
          {total === 0 ? '00 / 00' : `${padPage(index + 1)} / ${padPage(total)}`}
        </span>

        <div className="flex items-center justify-start gap-3">
          <button
            type="button"
            onClick={next}
            disabled={index >= total - 1}
            aria-label="Next page"
            className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-brand-primary text-white shadow-[0_8px_24px_rgba(33,60,239,0.35)] transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-25 disabled:shadow-none"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M7.3 15.7a1 1 0 0 1 0-1.4l4.3-4.3-4.3-4.3a1 1 0 0 1 1.42-1.4l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4 0Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <span className="hidden max-w-[220px] truncate text-xs text-white/40 md:block">
            {nextLabel}
          </span>
        </div>
      </footer>

      {tocOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Table of contents">
          <button
            type="button"
            aria-label="Close table of contents"
            onClick={() => setTocOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-md animate-book-in-right flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-black/8 px-6 py-5">
              <span className="text-sm font-bold uppercase tracking-[0.2em] text-brand-onyx">
                Contents
              </span>
              <button
                type="button"
                onClick={() => setTocOpen(false)}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-full text-brand-onyx/60 transition-colors hover:bg-black/5"
              >
                ×
              </button>
            </div>
            <div className="border-b border-black/8 px-6 py-4">
              <input
                type="search"
                value={tocQuery}
                onChange={(e) => setTocQuery(e.target.value)}
                placeholder="Search products…"
                autoFocus
                className="w-full rounded-full bg-[#f4f5f8] px-5 py-2.5 text-sm text-brand-onyx placeholder:text-black/40 focus:outline-none"
              />
            </div>
            <nav className="flex-1 overflow-y-auto px-4 py-5">
              {tocGroups.length === 0 && (
                <p className="px-2 py-6 text-center text-sm text-black/50">
                  No pages match “{tocQuery}”
                </p>
              )}
              {tocGroups.map(({ group, entries }) => (
                <div key={group} className="mb-6">
                  <p className="px-3 text-[11px] font-bold uppercase tracking-[0.2em] text-black/35">
                    {group}
                  </p>
                  <ul className="mt-2">
                    {entries.map(({ label, index: i }) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => {
                            goTo(i)
                            setTocOpen(false)
                          }}
                          aria-current={i === index ? 'page' : undefined}
                          className={`flex w-full items-baseline justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-[#f4f5f8] ${
                            i === index ? 'bg-[#f4f5f8] font-semibold text-brand-primary' : 'text-brand-onyx/80'
                          }`}
                        >
                          <span>{label}</span>
                          <span className="text-xs tabular-nums text-black/30">{padPage(i + 1)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
        </div>
      )}
    </div>
  )
}
