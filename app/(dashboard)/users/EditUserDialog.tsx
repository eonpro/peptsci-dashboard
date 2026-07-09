'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import type { ClientOption } from './InviteUserDialog'

type Status = 'PENDING' | 'ACTIVE' | 'SUSPENDED'

export interface EditableUser {
  id: string
  email: string | null
  firstName: string | null
  lastName: string | null
  status: Status
  clientId: string | null
}

const triggerClass = 'bg-[#0a0e3a] border-white/10 text-white'
const labelClass = 'text-white/70 text-xs'
const NO_CLIENT = '__none__'

/**
 * Edit an existing user's practice assignment and account status. Role changes
 * remain on the inline table Select (Super Admin only).
 */
export default function EditUserDialog({
  open,
  onOpenChange,
  user,
  clients,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: EditableUser | null
  clients: ClientOption[]
  onSaved: () => void | Promise<void>
}) {
  const [status, setStatus] = useState<Status>('ACTIVE')
  const [clientId, setClientId] = useState<string>(NO_CLIENT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && user) {
      setStatus(user.status)
      setClientId(user.clientId ?? NO_CLIENT)
      setError(null)
    }
  }, [open, user])

  async function submit() {
    if (!user) return
    setError(null)
    setSaving(true)
    try {
      const nextClientId = clientId === NO_CLIENT ? null : clientId
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, clientId: nextClientId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Failed to update user')
      await onSaved()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update user')
    } finally {
      setSaving(false)
    }
  }

  const name = user
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'User'
    : 'User'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-brand-onyx border-white/10 text-white sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-white">Edit {name}</DialogTitle>
          <DialogDescription className="text-white/60">
            Assign this user to a practice and manage their access status.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label className={labelClass}>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
              <SelectTrigger className={triggerClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-brand-onyx border-white/10">
                <SelectItem value="ACTIVE" className="text-white focus:bg-white/10 focus:text-white">
                  Active
                </SelectItem>
                <SelectItem value="PENDING" className="text-white focus:bg-white/10 focus:text-white">
                  Pending
                </SelectItem>
                <SelectItem
                  value="SUSPENDED"
                  className="text-white focus:bg-white/10 focus:text-white"
                >
                  Suspended
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className={labelClass}>Practice / Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className={triggerClass}>
                <SelectValue placeholder="No practice" />
              </SelectTrigger>
              <SelectContent className="bg-brand-onyx border-white/10 max-h-[280px]">
                <SelectItem
                  value={NO_CLIENT}
                  className="text-white focus:bg-white/10 focus:text-white"
                >
                  No practice
                </SelectItem>
                {clients.map((c) => (
                  <SelectItem
                    key={c.id}
                    value={c.id}
                    className="text-white focus:bg-white/10 focus:text-white"
                  >
                    {c.organizationName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={saving}
            className="bg-brand-primary hover:bg-[#1a30c0] text-white"
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
