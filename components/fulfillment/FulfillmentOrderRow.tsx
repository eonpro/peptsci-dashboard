'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Truck,
  Camera,
  ExternalLink,
  Loader2,
  Printer,
  ClipboardList,
  FileText,
  CheckCircle2,
  CreditCard,
  Undo2,
  MoreHorizontal,
  PackageCheck,
  RotateCcw,
} from 'lucide-react'

type StoredAddress = Record<string, unknown> | null

export type OrderRow = {
  id: string
  orderNumber: number
  status: string
  paymentStatus: string
  shippingStatus: string | null
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  total: number
  createdAt: string
  shippedAt: string | null
  shippingAddress: StoredAddress
  client: {
    id: string
    organizationName: string
    contactName: string | null
    contactPhone: string | null
  } | null
  items: { name: string; dose: string | null; quantity: number }[]
  fulfillmentStage: 'NOT_STARTED' | 'PICKING' | 'PICKED' | 'PACKED'
  photoCount: number
  labelCount: number
}

const STAGE_META: Record<OrderRow['fulfillmentStage'], { label: string; className: string }> = {
  NOT_STARTED: { label: 'Not started', className: 'border-white/15 text-white/50' },
  PICKING: { label: 'Picking', className: 'border-amber-400/40 text-amber-300' },
  PICKED: { label: 'Picked', className: 'border-sky-400/40 text-sky-300' },
  PACKED: { label: 'Packed', className: 'border-emerald-400/40 text-emerald-300' },
}

/** Honest payment badges — AUTHORIZED and PENDING are not the same as unpaid. */
const PAYMENT_META: Record<string, { label: string; className: string }> = {
  CAPTURED: { label: 'Paid', className: 'border-emerald-400/40 text-emerald-300' },
  AUTHORIZED: { label: 'Authorized', className: 'border-sky-400/40 text-sky-300' },
  PENDING: { label: 'Payment pending', className: 'border-amber-400/40 text-amber-300' },
  FAILED: { label: 'Payment failed', className: 'border-red-400/50 text-red-300' },
  REFUNDED: { label: 'Refunded', className: 'border-white/20 text-white/50' },
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price)
const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export interface FulfillmentOrderRowProps {
  order: OrderRow
  /** `${orderId}:${action}` currently advancing, if any. */
  advancing: string | null
  /** Bulk-select checkbox (only rendered when onSelectChange is provided). */
  selected?: boolean
  onSelectChange?: (checked: boolean) => void
  onAdvance: (orderId: string, action: 'pick' | 'pack' | 'reset') => void
  onCharge: () => void
  onRefund: () => void
  onPack: () => void
  onLabel: () => void
  onDisposition: () => void
}

/**
 * One fulfillment row with a single guided primary action:
 * Mark Picked → Photo & Pack → Create Label. Everything else lives behind an
 * overflow menu so the operator always knows the next step.
 */
export function FulfillmentOrderRow({
  order,
  advancing,
  selected,
  onSelectChange,
  onAdvance,
  onCharge,
  onRefund,
  onPack,
  onLabel,
  onDisposition,
}: FulfillmentOrderRowProps) {
  const payment = PAYMENT_META[order.paymentStatus] ?? {
    label: order.paymentStatus,
    className: 'border-white/20 text-white/50',
  }
  const shipped =
    !!order.trackingNumber ||
    order.shippingStatus === 'SHIPPED' ||
    order.shippingStatus === 'DELIVERED'

  // The one recommended next step for this order.
  const primary: 'pick' | 'pack' | 'label' | null = shipped
    ? null
    : order.fulfillmentStage === 'NOT_STARTED' || order.fulfillmentStage === 'PICKING'
      ? 'pick'
      : order.fulfillmentStage === 'PICKED'
        ? 'pack'
        : 'label'

  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {onSelectChange && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={(e) => onSelectChange(e.target.checked)}
            aria-label={`Select order ${order.orderNumber}`}
            className="mt-1.5 h-4 w-4 shrink-0 accent-brand-primary"
          />
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-white">Order #{order.orderNumber}</span>
            <Badge variant="outline" className="text-xs">
              {order.status}
            </Badge>
            <Badge variant="outline" className={`text-xs ${payment.className}`}>
              {payment.label}
            </Badge>
            <Badge
              variant="outline"
              className={`text-xs ${STAGE_META[order.fulfillmentStage].className}`}
            >
              {STAGE_META[order.fulfillmentStage].label}
            </Badge>
            {order.photoCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-white/50">
                <Camera className="h-3 w-3" /> {order.photoCount}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-white/60">
            {order.client?.organizationName || 'Unknown client'} · {formatDate(order.createdAt)} ·{' '}
            {formatPrice(order.total)}
          </p>
          {(order.items?.length ?? 0) > 0 && (
            <p className="mt-0.5 truncate text-sm text-white/70">
              {order.items
                .map((it) => `${it.quantity}× ${it.name}${it.dose ? ` ${it.dose}` : ''}`)
                .join(' · ')}
            </p>
          )}
          {order.trackingNumber && (
            <div className="mt-1 flex items-center gap-2 text-xs">
              <Truck className="h-3 w-3 text-blue-400" />
              <span className="text-white/50">{order.carrier || 'Tracking'}:</span>
              {order.trackingUrl ? (
                <a
                  href={order.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-blue-400 hover:underline"
                >
                  {order.trackingNumber}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="font-mono text-white/70">{order.trackingNumber}</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {/* Payment is money — keep it visible whenever action is needed. */}
        {order.paymentStatus !== 'CAPTURED' && order.paymentStatus !== 'REFUNDED' && (
          <Button size="sm" variant="outline" onClick={onCharge}>
            <CreditCard className="mr-2 h-4 w-4" /> Take Payment
          </Button>
        )}

        {/* One primary guided action. */}
        {primary === 'pick' && (
          <Button
            size="sm"
            disabled={advancing === `${order.id}:pick`}
            onClick={() => onAdvance(order.id, 'pick')}
          >
            {advancing === `${order.id}:pick` ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Mark Picked
          </Button>
        )}
        {primary === 'pack' && (
          <Button size="sm" onClick={onPack} title="Photograph the products in the box, then mark packed">
            <Camera className="mr-2 h-4 w-4" /> Photo & Pack
          </Button>
        )}
        {primary === 'label' && (
          <Button size="sm" onClick={onLabel}>
            <Printer className="mr-2 h-4 w-4" /> Create Label
          </Button>
        )}
        {/* Label stays reachable when it's not the recommended step. */}
        {primary !== 'label' && !shipped && (
          <Button size="sm" variant="outline" onClick={onLabel}>
            <Printer className="mr-2 h-4 w-4" /> Label
          </Button>
        )}
        {shipped && (
          <Button size="sm" variant="outline" onClick={onLabel}>
            <Printer className="mr-2 h-4 w-4" /> New Label
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`More actions for order ${order.orderNumber}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <a
                href={`/api/admin/orders/${order.id}/pick-list/pdf`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ClipboardList className="mr-2 h-4 w-4" /> Pick List (PDF)
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a
                href={`/api/admin/orders/${order.id}/packing-slip/pdf`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileText className="mr-2 h-4 w-4" /> Packing Slip (PDF)
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {order.fulfillmentStage === 'PICKED' && (
              <DropdownMenuItem onClick={onPack}>
                <Camera className="mr-2 h-4 w-4" /> Photo & Pack
              </DropdownMenuItem>
            )}
            {order.fulfillmentStage === 'PACKED' && (
              <DropdownMenuItem
                disabled={advancing === `${order.id}:reset`}
                onClick={() => onAdvance(order.id, 'reset')}
              >
                <RotateCcw className="mr-2 h-4 w-4" /> Reset stage
              </DropdownMenuItem>
            )}
            {!shipped && (
              <DropdownMenuItem
                onClick={onDisposition}
                title="Fulfilled outside the app? Mark it shipped/delivered manually."
              >
                <PackageCheck className="mr-2 h-4 w-4" /> Manual Disposition
              </DropdownMenuItem>
            )}
            {order.paymentStatus === 'CAPTURED' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onRefund} className="text-red-400 focus:text-red-300">
                  <Undo2 className="mr-2 h-4 w-4" /> Refund…
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
