'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

/**
 * MSA signature capture: signer details + a pointer-drawn signature pad.
 * Submits a PNG data-URL of the pad to /api/partners/msa.
 */
export function SignForm({
  defaultEntityName,
  defaultSignerName,
}: {
  defaultEntityName: string
  defaultSignerName: string
}) {
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1a1a2e'
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasInk(true)
  }

  function end() {
    drawing.current = false
  }

  function clear() {
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!hasInk) {
      toast.error('Draw your signature in the box')
      return
    }
    if (!agreed) {
      toast.error('Confirm you agree to the terms')
      return
    }
    const form = new FormData(e.currentTarget)
    setSubmitting(true)
    try {
      const res = await fetch('/api/partners/msa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signerName: form.get('signerName'),
          signerTitle: form.get('signerTitle') || '',
          legalEntityName: form.get('legalEntityName') || '',
          signatureImage: canvasRef.current!.toDataURL('image/png'),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.message || 'Failed to sign the agreement')
        return
      }
      toast.success('Agreement signed — welcome aboard!')
      router.push('/partners')
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = 'w-full rounded-md border px-3 py-2 text-sm'

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">Sign the agreement</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-500">Full legal name *</span>
          <input name="signerName" required maxLength={200} defaultValue={defaultSignerName} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-500">Title (e.g. Owner, VP Sales)</span>
          <input name="signerTitle" maxLength={120} className={inputClass} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-xs text-slate-500">Legal entity</span>
          <input name="legalEntityName" maxLength={200} defaultValue={defaultEntityName} className={inputClass} />
        </label>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-slate-500">Signature *</span>
          <button type="button" onClick={clear} className="text-xs text-[#213cef] hover:underline">
            Clear
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={640}
          height={160}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="h-40 w-full touch-none rounded-md border-2 border-dashed border-slate-300 bg-slate-50"
        />
      </div>

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5"
        />
        I have read and agree to the Marketing Services Agreement above, and I am authorized to
        bind the entity named.
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-[#213cef] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#1a30c4] disabled:opacity-60"
      >
        {submitting ? 'Signing…' : 'Sign agreement'}
      </button>
    </form>
  )
}
