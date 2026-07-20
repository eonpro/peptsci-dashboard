import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * Branded loading indicator: the PEPTSCI molecule icon pulsing like a
 * heartbeat (lub-dub) while a route segment streams in. Used by the
 * segment-level loading.tsx files so tab-to-tab navigation shows the brand
 * mark instead of a generic spinner. The animation is disabled automatically
 * for users with prefers-reduced-motion (global rule in globals.css).
 */
export function BrandLoader({
  className,
  size = 72,
}: {
  className?: string
  size?: number
}) {
  return (
    <div
      role="status"
      aria-label="Loading"
      aria-busy="true"
      className={cn('flex items-center justify-center', className)}
    >
      <Image
        src="/brand/peptsci-icon-transparent.png"
        alt=""
        width={size}
        height={Math.round(size * (1024 / 882))}
        priority
        className="animate-heartbeat drop-shadow-[0_0_24px_rgba(33,60,239,0.45)]"
      />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
