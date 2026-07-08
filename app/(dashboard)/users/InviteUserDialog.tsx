'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Loader2, Mail } from 'lucide-react'

export interface ClientOption {
  id: string
  organizationName: string
}

type Role = 'CLIENT' | 'ADMIN' | 'SUPER_ADMIN'

const inputClass = 'bg-[#0a0e3a] border-white/10 text-white placeholder:text-white/30'
const labelClass = 'text-white/70 text-xs'
const NO_CLIENT = '__none__'

/**
 * Send an email invitation to a new user. Role + practice assignment ride along
 * in the invitation metadata so they apply automatically on sign-up.
 */
export default function InviteUserDialog({
  open,
  onOpenChange,
  clients,
  isSuperAdmin,
  defaultClientId,
  lockClient,
  onInvited,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: ClientOption[]
  isSuperAdmin: boolean
  /** Preselect a practice (e.g. when inviting from a client detail page). */
  defaultClientId?: string
  /** When true, the practice select is fixed to defaultClientId. */
  lockClient?: boolean
  onInvited: () => void | Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('CLIENT')
  const [clientId, setClientId] = useState<string>(defaultClientId ?? NO_CLIENT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setEmail('')
      setRole('CLIENT')
      setClientId(defaultClientId ?? NO_CLIENT)
      setError(null)
    }
  }, [open, defaultClientId])

  async function submit() {
    setError(null)
    if (!email.trim()) {
      setError('Email is required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          role,
          ...(clientId && clientId !== NO_CLIENT ? { clientId } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Failed to send invitation')
      await onInvited()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send invitation')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-brand-onyx border-white/10 text-white sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Mail className="h-5 w-5 text-brand-primary" /> Invite User
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Send an email invite. The recipient sets their own password on sign-up.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label className={labelClass}>Email address *</Label>
            <Input
              type="email"
              className={inputClass}
              placeholder="name@practice.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className={labelClass}>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className={inputClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-brand-onyx border-white/10">
                <SelectItem value="CLIENT" className="text-white focus:bg-white/10 focus:text-white">
                  Client
                </SelectItem>
                <SelectItem
                  value="ADMIN"
                  disabled={!isSuperAdmin}
                  className="text-white focus:bg-white/10 focus:text-white"
                >
                  Admin {!isSuperAdmin && '(Super Admin only)'}
                </SelectItem>
                <SelectItem
                  value="SUPER_ADMIN"
                  disabled={!isSuperAdmin}
                  className="text-white focus:bg-white/10 focus:text-white"
                >
                  Super Admin {!isSuperAdmin && '(Super Admin only)'}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className={labelClass}>Practice / Client (optional)</Label>
            <Select
              value={clientId}
              onValueChange={setClientId}
              disabled={lockClient}
            >
              <SelectTrigger className={inputClass}>
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
            Send Invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
