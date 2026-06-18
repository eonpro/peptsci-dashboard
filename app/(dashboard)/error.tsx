'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Segment-level error boundary for the (dashboard) route group. Catches render
// errors from any dashboard page, reports them to Sentry, and offers recovery
// without a full reload. Styled for the dark admin shell.
export default function DashboardError({
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
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15">
          <AlertTriangle className="h-6 w-6 text-red-400" />
        </div>
        <h2 className="mb-2 text-xl font-semibold text-white">Something went wrong</h2>
        <p className="mb-6 text-sm text-white/60">
          This page hit an unexpected error. The issue has been logged. You can retry, and if it
          keeps happening, let us know.
        </p>
        {process.env.NODE_ENV !== 'production' && (
          <pre className="mb-6 max-h-32 overflow-auto rounded-lg bg-black/40 p-3 text-left text-xs text-red-300">
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ''}
          </pre>
        )}
        <Button onClick={reset} className="w-full">
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </div>
    </div>
  )
}
