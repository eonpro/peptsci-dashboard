'use client'

import { useEffect, useRef, useState } from 'react'
import { CoaCertificate } from '@/components/coa/CoaCertificate'
import type { CoaData } from '@/lib/coa'
import type { CoaBlendContext } from '@/lib/coa-blend'

const PAGE_W = 816
const PAGE_H = 1056

/** Fit an 8.5×11 certificate into the available width. */
export function CoaScaledPreview({
  data,
  blendContext,
}: {
  data: CoaData
  blendContext?: CoaBlendContext | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.45)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const sync = () => {
      const w = el.clientWidth
      if (w > 0) setScale(Math.min(1, w / PAGE_W))
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} className="overflow-hidden rounded-lg bg-[#c8ccda]">
      <div style={{ height: PAGE_H * scale }}>
        <div
          style={{
            width: PAGE_W,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <CoaCertificate
            data={data}
            logoSrc="/brand/peptsci-logo-dark.png"
            blendContext={blendContext}
          />
        </div>
      </div>
    </div>
  )
}
