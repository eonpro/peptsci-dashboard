'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2, Trash2 } from 'lucide-react'

type DeleteClientButtonProps = {
  clientId: string
  organizationName: string
  orderCount?: number
  /** Called after a successful delete (list page can remove the row). */
  onDeleted?: (clientId: string) => void
  /** When true, navigate to /clients after delete (detail page). */
  redirectOnSuccess?: boolean
  className?: string
  size?: 'default' | 'sm' | 'icon'
  variant?: 'outline' | 'ghost' | 'destructive'
}

/**
 * Admin delete for a practice. Soft-confirms first; if the API returns
 * HAS_HISTORY (409), asks again for an explicit force delete.
 */
export default function DeleteClientButton({
  clientId,
  organizationName,
  orderCount = 0,
  onDeleted,
  redirectOnSuccess = false,
  className,
  size = 'sm',
  variant = 'outline',
}: DeleteClientButtonProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    const hint =
      orderCount > 0
        ? ` This client has ${orderCount} order(s) — you will be asked to confirm force-delete.`
        : ''
    const ok = window.confirm(
      `Delete "${organizationName}"? Linked users will be unlinked (not deleted).${hint}\n\nThis cannot be undone.`
    )
    if (!ok) return

    setDeleting(true)
    try {
      // If we already know there is order history, go straight to force after the
      // second confirm below; otherwise try a normal delete first.
      let force = false
      if (orderCount > 0) {
        const forceOk = window.confirm(
          `"${organizationName}" has ${orderCount} order(s).\n\n` +
            'Force-delete will permanently remove those records along with the client. This cannot be undone.\n\n' +
            'Delete anyway?'
        )
        if (!forceOk) return
        force = true
      }

      const res = await fetch(`/api/admin/clients/${clientId}${force ? '?force=1' : ''}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))

      if (res.status === 409 && data.code === 'HAS_HISTORY') {
        const orders = data.orders ?? orderCount
        const invoices = data.invoices ?? 0
        const forceOk = window.confirm(
          `"${organizationName}" has ${orders} order(s) and ${invoices} invoice(s).\n\n` +
            'Force-delete will permanently remove those records along with the client. This cannot be undone.\n\n' +
            'Delete anyway?'
        )
        if (!forceOk) return

        const forceRes = await fetch(`/api/admin/clients/${clientId}?force=1`, {
          method: 'DELETE',
        })
        const forceData = await forceRes.json().catch(() => ({}))
        if (!forceRes.ok) {
          throw new Error(forceData.message || 'Failed to delete client')
        }
      } else if (!res.ok) {
        throw new Error(data.message || 'Failed to delete client')
      }

      onDeleted?.(clientId)
      if (redirectOnSuccess) router.push('/clients')
      else router.refresh()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to delete client')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      disabled={deleting}
      onClick={handleClick}
      className={
        className ??
        'border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300'
      }
      title={`Delete ${organizationName}`}
    >
      {deleting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <Trash2 className="h-4 w-4 mr-1.5" />
          Delete
        </>
      )}
    </Button>
  )
}
