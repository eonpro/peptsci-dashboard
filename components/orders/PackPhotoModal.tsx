'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Camera } from 'lucide-react'
import PackPhotoCapture, { type PackPhotoOrder } from './PackPhotoCapture'

export type { PackPhotoOrder }

export type PackPhotoModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: PackPhotoOrder
  onPacked?: () => void
}

/**
 * Standalone pack step with mandatory contents photo, for packing an order
 * outside the guided fulfillment wizard. Wraps the shared capture surface and
 * advances the order to PACKED once the photo is stored.
 */
export default function PackPhotoModal({
  open,
  onOpenChange,
  order,
  onPacked,
}: PackPhotoModalProps) {
  const markPacked = async () => {
    const res = await fetch(`/api/admin/orders/${order.id}/fulfillment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pack' }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.message || data.error || 'Photo saved, but marking packed failed — retry.')
    }
    onPacked?.()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" /> Pack Order #{order.orderNumber}
          </DialogTitle>
          <DialogDescription>
            Photograph the products inside the open box — before sealing — then mark it packed.
          </DialogDescription>
        </DialogHeader>

        <PackPhotoCapture order={order} active={open} onUploaded={markPacked} />
      </DialogContent>
    </Dialog>
  )
}
