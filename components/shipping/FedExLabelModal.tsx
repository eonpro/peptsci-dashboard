'use client'

import { useMemo, useState } from 'react'
import { Loader2, Printer, Package, Truck, AlertCircle, Zap, DollarSign, Download, CheckCircle2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FEDEX_SERVICE_TYPES, FEDEX_PACKAGING_TYPES } from '@/lib/fedex-services'

const ACCENT = '#2b2c84'

export type LabelAddress = {
  personName: string
  companyName?: string
  phoneNumber: string
  address1: string
  address2?: string | null
  city: string
  state: string
  zip: string
}

type RateQuote = {
  serviceType: string
  serviceName: string
  totalCharge: number
  currency: string
  surcharges: { type: string; description: string; amount: number }[]
  transitDays: string | null
}

type LabelFormat = 'PDF' | 'ZPLII' | 'PNG'

export type FedExLabelModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** PeptSci Order id (cuid). When set, the created label is linked to the order. */
  orderId?: string
  orderNumber?: number
  /** Pre-filled recipient address (from the order's shipping address or client). */
  destination?: Partial<LabelAddress>
  /** Optional origin override; defaults to the configured ship-from. */
  origin?: Partial<LabelAddress>
  onCreated?: (result: { trackingNumber: string; labelId: string }) => void
}

const DEFAULT_ORIGIN: LabelAddress = {
  personName: 'PeptSci',
  companyName: '',
  phoneNumber: '8138862800',
  address1: '7543 West Waters Avenue',
  address2: '',
  city: 'Tampa',
  state: 'FL',
  zip: '33615',
}

const inputCls =
  'rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#2b2c84] focus:outline-hidden focus:ring-1 focus:ring-[#2b2c84]'

function decodeBase64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function base64ToBlob(base64: string, type: string): Blob {
  // Cast through BlobPart: TS 5.7's generic typed arrays (Uint8Array<ArrayBufferLike>)
  // are not structurally assignable to the DOM BlobPart, but they are valid at runtime.
  return new Blob([decodeBase64ToBytes(base64) as BlobPart], { type })
}

export default function FedExLabelModal({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  destination,
  origin,
  onCreated,
}: FedExLabelModalProps) {
  const [labelFormat, setLabelFormat] = useState<LabelFormat>('PDF')
  const [originAddr, setOriginAddr] = useState<LabelAddress>({ ...DEFAULT_ORIGIN, ...origin })
  const [destAddr, setDestAddr] = useState<LabelAddress>({
    personName: destination?.personName || '',
    companyName: destination?.companyName || '',
    phoneNumber: destination?.phoneNumber || '',
    address1: destination?.address1 || '',
    address2: destination?.address2 || '',
    city: destination?.city || '',
    state: destination?.state || '',
    zip: destination?.zip || '',
  })

  const [oneRate, setOneRate] = useState(false)
  const [serviceType, setServiceType] = useState('STANDARD_OVERNIGHT')
  const [packagingType, setPackagingType] = useState('YOUR_PACKAGING')
  const [weightLbs, setWeightLbs] = useState(1)

  const [rateQuote, setRateQuote] = useState<RateQuote | null>(null)
  const [rateLoading, setRateLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ trackingNumber: string; labelId: string; popupBlocked: boolean } | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [redownloading, setRedownloading] = useState(false)

  const availableServices = useMemo(
    () => (oneRate ? FEDEX_SERVICE_TYPES.filter((s) => s.oneRateEligible) : FEDEX_SERVICE_TYPES),
    [oneRate]
  )
  const availablePackaging = useMemo(
    () => (oneRate ? FEDEX_PACKAGING_TYPES.filter((p) => p.oneRateEligible) : FEDEX_PACKAGING_TYPES),
    [oneRate]
  )
  const selectedPackaging = FEDEX_PACKAGING_TYPES.find((p) => p.code === packagingType)
  const maxWeight = oneRate && selectedPackaging?.oneRateMaxLbs ? selectedPackaging.oneRateMaxLbs : 150
  const selectedService = FEDEX_SERVICE_TYPES.find((s) => s.code === serviceType)

  const clearRate = () => setRateQuote(null)

  const handleOneRateToggle = (enabled: boolean) => {
    setOneRate(enabled)
    setRateQuote(null)
    if (enabled) {
      if (!FEDEX_SERVICE_TYPES.find((s) => s.code === serviceType && s.oneRateEligible)) {
        setServiceType('STANDARD_OVERNIGHT')
      }
      if (!FEDEX_PACKAGING_TYPES.find((p) => p.code === packagingType && p.oneRateEligible)) {
        setPackagingType('FEDEX_PAK')
      }
    }
  }

  const isOriginValid =
    originAddr.personName && originAddr.address1 && originAddr.city && originAddr.state && originAddr.zip && originAddr.phoneNumber
  const isDestValid =
    destAddr.personName && destAddr.address1 && destAddr.city && destAddr.state && destAddr.zip && destAddr.phoneNumber

  const formatCurrency = (amount: number, currency: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount)

  const handleGetRate = async () => {
    setError(null)
    setRateLoading(true)
    setRateQuote(null)
    try {
      const res = await fetch('/api/admin/shipping/fedex/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { address1: originAddr.address1, city: originAddr.city, state: originAddr.state, zip: originAddr.zip },
          destination: {
            address1: destAddr.address1,
            city: destAddr.city,
            state: destAddr.state,
            zip: destAddr.zip,
            residential: true,
          },
          serviceType,
          packagingType,
          weightLbs,
          oneRate,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to get rate')
      setRateQuote(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get rate quote')
    } finally {
      setRateLoading(false)
    }
  }

  const openLabel = (base64: string, format: string, trackingNum?: string): boolean => {
    const fileName = `FedEx-Label-${trackingNum || 'label'}`
    if (format === 'ZPLII') {
      const blob = new Blob([atob(base64)], { type: 'application/octet-stream' })
      triggerDownload(blob, `${fileName}.zpl`)
      return true
    }
    if (format === 'PNG') {
      const blob = base64ToBlob(base64, 'image/png')
      triggerDownload(blob, `${fileName}.png`)
      return true
    }
    const blob = base64ToBlob(base64, 'application/pdf')
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    return !!win
  }

  const triggerDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleRedownload = async () => {
    if (!success) return
    setRedownloading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/shipping/fedex/label?id=${success.labelId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to retrieve label')
      const fmt = data.labelFormat || 'PDF'
      const ext = fmt === 'ZPLII' ? 'zpl' : fmt === 'PNG' ? 'png' : 'pdf'
      const blob =
        fmt === 'ZPLII'
          ? new Blob([atob(data.labelData)], { type: 'application/octet-stream' })
          : base64ToBlob(data.labelData, fmt === 'PNG' ? 'image/png' : 'application/pdf')
      triggerDownload(blob, `FedEx-Label-${success.trackingNumber}.${ext}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download label')
    } finally {
      setRedownloading(false)
    }
  }

  const handleSubmit = async () => {
    if (submitted) return
    setSubmitted(true)
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/admin/shipping/fedex/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(orderId ? { orderId } : {}),
          origin: originAddr,
          destination: destAddr,
          serviceType,
          packagingType,
          weightLbs,
          oneRate,
          labelFormat,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to create label')
      const opened = openLabel(data.labelData, data.labelFormat || labelFormat, data.trackingNumber)
      setSuccess({ trackingNumber: data.trackingNumber, labelId: data.id, popupBlocked: !opened })
      onCreated?.({ trackingNumber: data.trackingNumber, labelId: data.id })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      setSubmitted(false)
    } finally {
      setLoading(false)
    }
  }

  const updateOrigin = (patch: Partial<LabelAddress>) => {
    setOriginAddr((prev) => ({ ...prev, ...patch }))
    clearRate()
  }
  const updateDest = (patch: Partial<LabelAddress>) => {
    setDestAddr((prev) => ({ ...prev, ...patch }))
    clearRate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" style={{ color: ACCENT }} />
            Create FedEx Shipping Label
          </DialogTitle>
          <DialogDescription>
            {orderNumber ? `Order #${orderNumber}. ` : ''}Generate a label, get a rate quote, and attach
            tracking to the order automatically.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <p className="font-medium text-green-800">Label created successfully</p>
              </div>
              <p className="mt-2 text-sm text-green-700">
                Tracking: <span className="font-mono font-semibold">{success.trackingNumber}</span>
              </p>
              {labelFormat === 'ZPLII' ? (
                <p className="mt-1 text-xs text-green-600">ZPL file downloaded — send to your Zebra printer.</p>
              ) : success.popupBlocked ? (
                <p className="mt-1 text-xs text-amber-700">
                  Popup blocked — use the button below to download the label.
                </p>
              ) : (
                <p className="mt-1 text-xs text-green-600">The label opened in a new tab for printing.</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3">
              <Button variant="outline" onClick={handleRedownload} disabled={redownloading}>
                {redownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Re-download
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Label format */}
            <fieldset className="space-y-2">
              <legend className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                <Printer className="h-4 w-4" /> Label Format
              </legend>
              <div className="flex gap-2">
                {([
                  { value: 'PDF' as LabelFormat, label: 'PDF', desc: 'Standard printers' },
                  { value: 'ZPLII' as LabelFormat, label: 'ZPL', desc: 'Zebra thermal' },
                  { value: 'PNG' as LabelFormat, label: 'PNG', desc: 'Image file' },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLabelFormat(opt.value)}
                    className={`flex-1 rounded-lg border p-2.5 text-left transition-colors ${
                      labelFormat === opt.value ? 'bg-[#2b2c84]/5 ring-1' : 'border-gray-200 hover:border-gray-300'
                    }`}
                    style={labelFormat === opt.value ? { borderColor: ACCENT, boxShadow: `0 0 0 1px ${ACCENT}` } : undefined}
                  >
                    <p className="text-sm font-medium" style={{ color: labelFormat === opt.value ? ACCENT : '#374151' }}>
                      {opt.label}
                    </p>
                    <p className="text-xs text-gray-500">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Origin */}
            <fieldset className="space-y-3">
              <legend className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                <Package className="h-4 w-4" /> From (Origin)
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input value={originAddr.personName} onChange={(e) => updateOrigin({ personName: e.target.value })} placeholder="Name / Company" />
                <Input value={originAddr.phoneNumber} onChange={(e) => updateOrigin({ phoneNumber: e.target.value })} placeholder="Phone" />
              </div>
              <Input value={originAddr.address1} onChange={(e) => updateOrigin({ address1: e.target.value })} placeholder="Address Line 1" />
              <Input value={originAddr.address2 || ''} onChange={(e) => updateOrigin({ address2: e.target.value })} placeholder="Address Line 2 (optional)" />
              <div className="grid gap-3 sm:grid-cols-3">
                <Input value={originAddr.city} onChange={(e) => updateOrigin({ city: e.target.value })} placeholder="City" />
                <Input value={originAddr.state} maxLength={2} onChange={(e) => updateOrigin({ state: e.target.value.toUpperCase() })} placeholder="State" className="uppercase" />
                <Input value={originAddr.zip} onChange={(e) => updateOrigin({ zip: e.target.value })} placeholder="ZIP" />
              </div>
            </fieldset>

            {/* Destination */}
            <fieldset className="space-y-3">
              <legend className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                <Package className="h-4 w-4" /> To (Destination)
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input value={destAddr.personName} onChange={(e) => updateDest({ personName: e.target.value })} placeholder="Recipient Name" />
                <Input value={destAddr.phoneNumber} onChange={(e) => updateDest({ phoneNumber: e.target.value })} placeholder="Phone" />
              </div>
              <Input value={destAddr.address1} onChange={(e) => updateDest({ address1: e.target.value })} placeholder="Address Line 1" />
              <Input value={destAddr.address2 || ''} onChange={(e) => updateDest({ address2: e.target.value })} placeholder="Address Line 2 (optional)" />
              <div className="grid gap-3 sm:grid-cols-3">
                <Input value={destAddr.city} onChange={(e) => updateDest({ city: e.target.value })} placeholder="City" />
                <Input value={destAddr.state} maxLength={2} onChange={(e) => updateDest({ state: e.target.value.toUpperCase() })} placeholder="State" className="uppercase" />
                <Input value={destAddr.zip} onChange={(e) => updateDest({ zip: e.target.value })} placeholder="ZIP" />
              </div>
            </fieldset>

            {/* Shipping options */}
            <fieldset className="space-y-3">
              <legend className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                <Truck className="h-4 w-4" /> Shipping Options
              </legend>
              <div
                className="flex items-center justify-between rounded-lg border p-3"
                style={oneRate ? { borderColor: ACCENT, backgroundColor: `${ACCENT}0d` } : { borderColor: '#e5e7eb' }}
              >
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4" style={{ color: oneRate ? ACCENT : '#9ca3af' }} />
                  <div>
                    <p className="text-sm font-medium text-gray-800">Ship with FedEx One Rate</p>
                    <p className="text-xs text-gray-500">Flat-rate pricing by package size</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={oneRate}
                  onClick={() => handleOneRateToggle(!oneRate)}
                  className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
                  style={{ backgroundColor: oneRate ? ACCENT : '#e5e7eb' }}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      oneRate ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div>
                <Label className="mb-1 block text-xs font-medium text-gray-500">Service Type</Label>
                <select value={serviceType} onChange={(e) => { setServiceType(e.target.value); clearRate() }} className={`w-full ${inputCls}`}>
                  {availableServices.map((s) => (
                    <option key={s.code} value={s.code}>{s.label} — {s.estimatedDays}</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="mb-1 block text-xs font-medium text-gray-500">Packaging{oneRate ? ' (One Rate)' : ''}</Label>
                  <select value={packagingType} onChange={(e) => { setPackagingType(e.target.value); clearRate() }} className={`w-full ${inputCls}`}>
                    {availablePackaging.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.label}{oneRate && p.oneRateMaxLbs ? ` (up to ${p.oneRateMaxLbs} lbs)` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="mb-1 block text-xs font-medium text-gray-500">Weight (lbs)</Label>
                  <Input
                    type="number"
                    min={0.1}
                    max={maxWeight}
                    step={0.1}
                    value={weightLbs}
                    onChange={(e) => { setWeightLbs(parseFloat(e.target.value) || 1); clearRate() }}
                  />
                </div>
              </div>
              {selectedService && <p className="text-xs text-gray-500">Estimated delivery: {selectedService.estimatedDays}</p>}
            </fieldset>

            {/* Rate quote */}
            {rateQuote && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-blue-600" />
                    <p className="text-sm font-medium text-blue-800">Estimated Shipping Cost</p>
                  </div>
                  <p className="text-xl font-bold text-blue-900">{formatCurrency(rateQuote.totalCharge, rateQuote.currency)}</p>
                </div>
                {rateQuote.transitDays && <p className="mt-1 text-xs text-blue-600">Transit: {rateQuote.transitDays}</p>}
                {rateQuote.surcharges?.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {rateQuote.surcharges.map((s, i) => (
                      <div key={i} className="flex justify-between text-xs text-blue-700">
                        <span>{s.description || s.type}</span>
                        <span>{formatCurrency(s.amount, rateQuote.currency)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading || rateLoading}>
                Cancel
              </Button>
              {!rateQuote ? (
                <Button
                  variant="outline"
                  onClick={handleGetRate}
                  disabled={rateLoading || !originAddr.address1 || !originAddr.zip || !destAddr.address1 || !destAddr.zip}
                  style={{ borderColor: ACCENT, color: ACCENT }}
                >
                  {rateLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
                  {rateLoading ? 'Getting Rate…' : 'Get Rate Quote'}
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={loading || !isOriginValid || !isDestValid} style={{ backgroundColor: ACCENT }}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                  {loading ? 'Creating…' : `Confirm & Print — ${formatCurrency(rateQuote.totalCharge, rateQuote.currency)}`}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
