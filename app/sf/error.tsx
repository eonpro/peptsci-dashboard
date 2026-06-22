'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

// Segment-level error boundary for white-label storefronts. Theme-neutral
// (inherits the tenant's brand text color); reports to Sentry.
export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div
        className="w-full max-w-md rounded-2xl border p-8 text-center"
        style={{ borderColor: 'color-mix(in srgb, currentColor 20%, transparent)' }}
      >
        <h2 className="mb-2 text-xl font-semibold">Something went wrong</h2>
        <p className="mb-6 text-sm opacity-70">
          We couldn&apos;t load this page. Please try again in a moment.
        </p>
        <button
          onClick={reset}
          className="rounded-lg px-5 py-2 text-sm font-medium"
          style={{ backgroundColor: 'var(--sf-primary, #213cef)', color: '#fff' }}
        >
          Try again
        </button>
      </div>
    </div>
  )
}
