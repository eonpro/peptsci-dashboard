'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import PackPhotoCapture from '@/components/orders/PackPhotoCapture'
import {
  downloadLabelSheet,
  fetchLabelShortfall,
  postFulfillment,
  type AdvanceableStep,
} from '@/lib/fulfillment/api-client'
import {
  describeLabelShortfall,
  type LabelShortfallEntry,
} from '@/lib/fulfillment/label-shortfall'
import {
  WIZARD_STEPS,
  canComplete,
  isComplete,
  nextStep,
  previousStep,
  resumeStep,
  stepIndex,
  stepLabel,
  type FulfillmentStageName,
  type FulfillmentStepName,
} from '@/lib/fulfillment/wizard-core'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  PackageCheck,
  Printer,
  Truck,
} from 'lucide-react'

export type WizardOrder = {
  id: string
  orderNumber: number
  items: { name: string; dose: string | null; quantity: number }[]
  shippingAddress: Record<string, unknown> | null
  client: { organizationName: string; contactName: string | null } | null
  carrier: string | null
  trackingNumber: string | null
  photoCount: number
  photoSkippedAt: string | null
  fulfillmentStage: FulfillmentStageName
  fulfillmentStep: FulfillmentStepName | null
}

export type FulfillmentWizardProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: WizardOrder
  /** Forces the opening screen — used to land on Review after shipping. */
  initialStep?: FulfillmentStepName
  /** Hand off to the FedEx label modal. */
  onCreateLabel: () => void
  /** Hand off to the manual tracking / disposition modal. */
  onEnterTrackingManually: () => void
  /** Something was persisted; refresh the list underneath. */
  onChanged: () => void
  /** The order was marked fulfilled. */
  onFulfilled: () => void
}

function formatShipTo(order: WizardOrder): string {
  const a = order.shippingAddress ?? {}
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const name = str(a.name) || str(a.personName) || order.client?.contactName || ''
  const line = [str(a.address1) || str(a.line1) || str(a.street), str(a.address2) || str(a.line2)]
    .filter(Boolean)
    .join(', ')
  const city = [str(a.city), [str(a.state), str(a.zip)].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ')
  return [name, line, city].filter(Boolean).join(' · ') || 'No shipping address on file'
}

/** Back to the previous screen; renders nothing on the first one. */
function BackButton({
  step,
  disabled,
  onBack,
}: {
  step: FulfillmentStepName
  disabled: boolean
  onBack: (to: FulfillmentStepName) => void
}) {
  const prev = previousStep(step)
  if (!prev) return null
  return (
    <Button variant="outline" size="sm" disabled={disabled} onClick={() => onBack(prev)}>
      <ArrowLeft className="mr-2 h-4 w-4" /> Back
    </Button>
  )
}

/**
 * Vials the label sheet cannot cover, because their variant has no allocatable
 * batch. Shown on Verify (from the pick list) and on the label screen (from the
 * print response) so a short sheet is never applied to a box unnoticed.
 */
function ShortfallNotice({
  entries,
  children,
}: {
  entries: LabelShortfallEntry[]
  children?: React.ReactNode
}) {
  const message = describeLabelShortfall(entries)
  if (!message) return null
  return (
    <div className="space-y-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{message}</span>
      </div>
      {children}
    </div>
  )
}

/** Compact "Step 3 of 6" rail so the operator always knows where they are. */
function StepRail({ current }: { current: FulfillmentStepName }) {
  const position = stepIndex(current)
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {WIZARD_STEPS.map((s, i) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full ${i + 1 <= position ? 'bg-brand-primary' : 'bg-white/10'}`}
          />
        ))}
      </div>
      <p className="text-xs text-white/50">
        Step {position} of {WIZARD_STEPS.length} · {stepLabel(current)}
      </p>
    </div>
  )
}

/**
 * Guided fulfillment: verify the contents, print the vial labels and packing
 * slip, photograph and pack, ship, then mark the order fulfilled. The cursor is
 * persisted per order, so closing this dialog — or handing the tablet to someone
 * else — resumes on the same screen.
 */
export default function FulfillmentWizard({
  open,
  onOpenChange,
  order,
  initialStep,
  onCreateLabel,
  onEnterTrackingManually,
  onChanged,
  onFulfilled,
}: FulfillmentWizardProps) {
  const [step, setStep] = useState<FulfillmentStepName>(() =>
    resumeStep({ step: order.fulfillmentStep, stage: order.fulfillmentStage })
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmSkip, setConfirmSkip] = useState(false)
  const [shortfall, setShortfall] = useState<LabelShortfallEntry[]>([])
  /** A print really did come back short — offer to move on deliberately. */
  const [printedShort, setPrintedShort] = useState(false)

  // Anchor once per order (and once per explicit `initialStep` instruction).
  // The dialog is hidden — not unmounted — while a ship modal is open, so a
  // cancelled label must not re-anchor from the now-stale opening snapshot and
  // throw the operator back to Verify.
  const anchoredRef = useRef<string | null>(null)
  useEffect(() => {
    if (!open) return
    const anchor = `${order.id}:${initialStep ?? ''}`
    if (anchoredRef.current === anchor) return
    anchoredRef.current = anchor
    setError(null)
    setConfirmSkip(false)
    setPrintedShort(false)
    setStep(
      initialStep ?? resumeStep({ step: order.fulfillmentStep, stage: order.fulfillmentStage })
    )
    // Learn about unlabelable lines up front, so Verify can flag them before
    // anyone prints. Never throws; worst case the notice just doesn't appear.
    void fetchLabelShortfall(order.id).then(setShortfall)
  }, [open, initialStep, order.id, order.fulfillmentStep, order.fulfillmentStage])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  /** Persist the current screen and move to the next one. */
  const advance = (from: AdvanceableStep, opts: { manual?: boolean; skipped?: boolean } = {}) =>
    run(async () => {
      await postFulfillment(order.id, { action: 'step', step: from, ...opts })
      setStep(nextStep(from))
      onChanged()
    })

  const openPdf = (path: string) => {
    window.open(`/api/admin/orders/${order.id}/${path}`, '_blank', 'noopener,noreferrer')
  }

  /**
   * Download the sheet, then only advance if it covered every vial. A short sheet
   * holds the operator on this screen with the missing products named.
   */
  const printLabels = () =>
    run(async () => {
      const { shortfall: short } = await downloadLabelSheet(order.id, order.orderNumber)
      setShortfall(short)
      setPrintedShort(short.length > 0)
      if (short.length > 0) return
      await postFulfillment(order.id, { action: 'step', step: 'VIAL_LABELS' })
      setStep(nextStep('VIAL_LABELS'))
      onChanged()
    })

  const completion = canComplete({
    trackingNumber: order.trackingNumber,
    photoCount: order.photoCount,
    photoSkippedAt: order.photoSkippedAt,
  })

  // Going back only moves the local cursor; the timestamps already recorded
  // stand, and redoing a screen simply re-stamps it.
  const back = <BackButton step={step} disabled={busy} onBack={setStep} />

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5" /> Fulfill Order #{order.orderNumber}
            </DialogTitle>
            <DialogDescription>{formatShipTo(order)}</DialogDescription>
          </DialogHeader>

          <StepRail current={step} />

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {step === 'VERIFY' && (
            <div className="space-y-4">
              <p className="text-sm text-white/60">
                Check the order number against the paperwork and confirm every line is on the bench.
              </p>
              <div className="rounded-lg border border-white/10 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                  Order #{order.orderNumber} · {order.client?.organizationName || 'Unknown client'}
                </p>
                <ul className="space-y-1 text-sm">
                  {order.items.map((it, i) => (
                    <li key={i} className="flex items-center gap-2 text-white/80">
                      <ClipboardList className="h-3.5 w-3.5 shrink-0 text-white/40" />
                      {it.quantity}× {it.name}
                      {it.dose ? ` ${it.dose}` : ''}
                    </li>
                  ))}
                  {order.items.length === 0 && (
                    <li className="text-sm text-amber-300">This order has no line items.</li>
                  )}
                </ul>
              </div>
              <ShortfallNotice entries={shortfall} />
              <Button className="w-full" disabled={busy} onClick={() => void advance('VERIFY')}>
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Confirm Order &amp; Contents
              </Button>
            </div>
          )}

          {step === 'VIAL_LABELS' && (
            <div className="space-y-4">
              <p className="text-sm text-white/60">
                Print the vial labels and apply them to each vial. This is a preview print — stock is
                drawn when the order ships.
              </p>
              <ShortfallNotice entries={shortfall}>
                {printedShort && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void advance('VIAL_LABELS')}
                  >
                    Continue without those labels
                  </Button>
                )}
              </ShortfallNotice>
              <div className="space-y-2">
                <Button className="w-full" disabled={busy} onClick={() => void printLabels()}>
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Printer className="mr-2 h-4 w-4" />
                  )}
                  {printedShort ? 'Reprint Vial Labels' : 'Print Vial Labels'}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void advance('VIAL_LABELS', { manual: true })}
                >
                  Already printed manually
                </Button>
              </div>
              {back}
            </div>
          )}

          {step === 'PACKING_SLIP' && (
            <div className="space-y-4">
              <p className="text-sm text-white/60">
                Print the packing slip and drop it in the box with the vials.
              </p>
              <div className="space-y-2">
                <Button
                  className="w-full"
                  disabled={busy}
                  onClick={() => {
                    openPdf('packing-slip/pdf')
                    void advance('PACKING_SLIP')
                  }}
                >
                  <FileText className="mr-2 h-4 w-4" /> Print Packing Slip
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void advance('PACKING_SLIP', { manual: true })}
                >
                  Already printed manually
                </Button>
              </div>
              {back}
            </div>
          )}

          {step === 'PHOTO' && (
            <div className="space-y-4">
              <p className="text-sm text-white/60">
                Photograph the products inside the open box — before sealing — so the client can see
                exactly what shipped.
              </p>
              <PackPhotoCapture
                order={{ id: order.id, orderNumber: order.orderNumber, items: order.items }}
                active={open && step === 'PHOTO'}
                submitLabel="Save Photo & Continue"
                onUploaded={async () => {
                  await postFulfillment(order.id, { action: 'step', step: 'PHOTO' })
                  setStep(nextStep('PHOTO'))
                  onChanged()
                }}
                footer={
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => setConfirmSkip(true)}
                    title="Continue without a contents photo"
                  >
                    Skip photo
                  </Button>
                }
              />
              {back}
            </div>
          )}

          {step === 'SHIP' && (
            <div className="space-y-4">
              <p className="text-sm text-white/60">
                Seal the box and create the shipping label. This draws the vials from inventory and
                notifies the customer.
              </p>
              {order.trackingNumber && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">
                  <Truck className="h-4 w-4 shrink-0" />
                  <span>
                    Tracking on file:{' '}
                    <span className="font-mono">{order.trackingNumber}</span>
                    {order.carrier ? ` · ${order.carrier}` : ''}
                  </span>
                </div>
              )}
              <div className="space-y-2">
                <Button className="w-full" disabled={busy} onClick={onCreateLabel}>
                  <Printer className="mr-2 h-4 w-4" /> Print FedEx Label
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={onEnterTrackingManually}
                >
                  Enter Tracking Manually
                </Button>
                {order.trackingNumber && (
                  <Button
                    variant="ghost"
                    className="w-full"
                    disabled={busy}
                    onClick={() => void advance('SHIP')}
                  >
                    Continue with existing tracking
                  </Button>
                )}
              </div>
              {back}
            </div>
          )}

          {step === 'REVIEW' && (
            <div className="space-y-4">
              <p className="text-sm text-white/60">
                Last look before this order is closed out.
              </p>
              <ul className="space-y-1.5 rounded-lg border border-white/10 p-3 text-sm">
                <li className="flex items-center gap-2 text-white/80">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  {order.items.reduce((n, it) => n + it.quantity, 0)} vial(s) across{' '}
                  {order.items.length} line(s) verified
                </li>
                <li className="flex items-center gap-2 text-white/80">
                  {completion.photoMissing ? (
                    <>
                      <Camera className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                      <span className="text-amber-300">
                        No contents photo on file{order.photoSkippedAt ? ' (skipped)' : ''}
                      </span>
                    </>
                  ) : (
                    <>
                      <Camera className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      Contents photo captured
                    </>
                  )}
                </li>
                <li className="flex items-center gap-2 text-white/80">
                  <Truck
                    className={`h-3.5 w-3.5 shrink-0 ${order.trackingNumber ? 'text-emerald-400' : 'text-amber-400'}`}
                  />
                  {order.trackingNumber ? (
                    <span>
                      {order.carrier || 'Carrier'} ·{' '}
                      <span className="font-mono">{order.trackingNumber}</span>
                    </span>
                  ) : (
                    <span className="text-amber-300">No tracking number yet</span>
                  )}
                </li>
              </ul>
              {!completion.ok && completion.reason && (
                <p className="text-sm text-amber-300">{completion.reason}</p>
              )}
              <Button
                className="w-full"
                disabled={busy || !completion.ok}
                onClick={() =>
                  void run(async () => {
                    await postFulfillment(order.id, { action: 'complete' })
                    onFulfilled()
                    onOpenChange(false)
                  })
                }
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PackageCheck className="mr-2 h-4 w-4" />
                )}
                Mark Order as Fulfilled
              </Button>
              {back}
            </div>
          )}

          {isComplete(step) && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Order #{order.orderNumber} is fulfilled.
              </div>
              <Button className="w-full" variant="outline" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmSkip} onOpenChange={setConfirmSkip}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to skip the photo?</AlertDialogTitle>
            <AlertDialogDescription>
              The contents photo is the only proof of what went in the box. Skipping is recorded
              against your name on this order.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep photo</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => {
                setConfirmSkip(false)
                void advance('PHOTO', { skipped: true })
              }}
            >
              Skip photo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
