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
import { KeyRound, Loader2 } from 'lucide-react'

const inputClass = 'bg-[#0a0e3a] border-white/10 text-white placeholder:text-white/30'
const labelClass = 'text-white/70 text-xs'

/**
 * Admin-provision a Clerk login (email + password) linked to a practice.
 * Password is set here; the practice user can sign in immediately.
 */
export default function CreateClientUserDialog({
  open,
  onOpenChange,
  clientId,
  organizationName,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  organizationName: string
  onCreated: () => void | Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setEmail('')
      setPassword('')
      setConfirm('')
      setFirstName('')
      setLastName('')
      setError(null)
    }
  }, [open])

  async function submit() {
    setError(null)
    if (!email.trim()) {
      setError('Email (login) is required')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          clientId,
          ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
          ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Failed to create login')
      await onCreated()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create login')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-brand-onyx border-white/10 text-white sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-brand-primary" /> Create Login
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Set email and password for {organizationName}. They can sign in at peptsci.com immediately.
            Share credentials out-of-band — they are not emailed.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label className={labelClass}>Email (login) *</Label>
            <Input
              type="email"
              className={inputClass}
              placeholder="name@practice.com"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={labelClass}>First name</Label>
              <Input
                className={inputClass}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={labelClass}>Last name</Label>
              <Input
                className={inputClass}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className={labelClass}>Password *</Label>
            <Input
              type="password"
              className={inputClass}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className={labelClass}>Confirm password *</Label>
            <Input
              type="password"
              className={inputClass}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
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
            Create login
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
