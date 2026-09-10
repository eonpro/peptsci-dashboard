'use client'

import { useEffect, useState } from 'react'

const UNREAD_POLL_MS = 60_000

/**
 * Unread SMS threads for the Messages tab badge. Polls only while `enabled`
 * (the viewer can see Messages) and the tab is visible; silent on errors so a
 * missing permission or offline API never breaks the nav.
 */
export function useSmsUnreadCount(enabled: boolean): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const load = () =>
      fetch('/api/admin/messages/unread-count')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d) setCount(Number(d.unread) || 0)
        })
        .catch(() => {})
    load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, UNREAD_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [enabled])
  return count
}

/** Badge text: caps at 99+. */
export function formatUnreadBadge(count: number): string {
  return count > 99 ? '99+' : String(count)
}
