'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/** Small client form that routes to /tracking/<number>. Public, no auth. */
export function TrackingLookupForm({ initialValue = '' }: { initialValue?: string }) {
  const router = useRouter()
  const [value, setValue] = useState(initialValue)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (trimmed) router.push(`/tracking/${encodeURIComponent(trimmed)}`)
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter tracking number"
        aria-label="Tracking number"
        className="min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-hidden focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
      />
      <button
        type="submit"
        className="shrink-0 rounded-xl bg-brand-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1a30c0]"
      >
        Track
      </button>
    </form>
  )
}
