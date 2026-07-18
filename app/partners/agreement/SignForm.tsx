'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">Sign the agreement</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="text-sm">
          <Label htmlFor="signerName" className="mb-1 block text-xs font-normal text-slate-500">
            Full legal name *
          </Label>
          <Input
            id="signerName"
            name="signerName"
            required
            maxLength={200}
            defaultValue={defaultSignerName}
            className="bg-white"
          />
        </div>
        <div className="text-sm">
          <Label htmlFor="signerTitle" className="mb-1 block text-xs font-normal text-slate-500">
            Title (e.g. Owner, VP Sales)
          </Label>
          <Input id="signerTitle" name="signerTitle" maxLength={120} className="bg-white" />
        </div>
        <div className="text-sm sm:col-span-2">
          <Label htmlFor="legalEntityName" className="mb-1 block text-xs font-normal text-slate-500">
            Legal entity
          </Label>
          <Input
            id="legalEntityName"
            name="legalEntityName"
            maxLength={200}
            defaultValue={defaultEntityName}
            className="bg-white"
          />
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-slate-500">Signature *</span>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={clear}
          >
            Clear
          </Button>
        </div>
        <canvas
          ref={canvasRef}
          width={640}
          height={160}
          role="img"
          aria-label="Signature pad — draw your signature here"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="h-40 w-full touch-none rounded-md border-2 border-dashed border-slate-300 bg-slate-50"
        />
        <p className="mt-1 text-xs text-slate-400">
          Draw your signature in the box above using your mouse, finger, or stylus.
        </p>
      </div>

      <div className="flex items-start gap-2">
        <Checkbox
          id="agree-terms"
          checked={agreed}
          onCheckedChange={(checked) => setAgreed(checked === true)}
          className="mt-0.5"
        />
        <Label htmlFor="agree-terms" className="text-sm font-normal leading-snug text-slate-700">
          I have read and agree to the Marketing Services Agreement above, and I am authorized to
          bind the entity named.
        </Label>
      </div>

      <Button type="submit" disabled={submitting} className="font-semibold">
        {submitting ? 'Signing…' : 'Sign agreement'}
      </Button>
    </form>
  )
}
