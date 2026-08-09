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
 * Admin reset of a practice user's Clerk password. Signs out other sessions.
 */
export default function ResetPasswordDialog({
  open,
  onOpenChange,
  clerkUserId,
  clientId,
  email,
  displayName,
  onReset,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clerkUserId: string | null
  clientId: string
  email: string | null
  displayName: string
  onReset?: () => void | Promise<void>
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (open) {
      setPassword('')
      setConfirm('')
      setError(null)
      setDone(false)
    }
  }, [open])

  async function submit() {
    if (!clerkUserId) return
    setError(null)
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
      const res = await fetch(`/api/admin/users/${clerkUserId}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, clientId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Failed to reset password')
      setDone(true)
      await onReset?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-brand-onyx border-white/10 text-white sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-brand-primary" /> Reset Password
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Set a new password for {displayName}
            {email ? ` (${email})` : ''}. Existing sessions will be signed out.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-3 text-sm text-green-300">
            Password updated. Share the new password with the user out-of-band.
          </div>
        ) : (
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label className={labelClass}>New password *</Label>
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
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
          >
            {done ? 'Close' : 'Cancel'}
          </Button>
          {!done && (
            <Button
              onClick={submit}
              disabled={saving || !clerkUserId}
              className="bg-brand-primary hover:bg-[#1a30c0] text-white"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reset password
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
