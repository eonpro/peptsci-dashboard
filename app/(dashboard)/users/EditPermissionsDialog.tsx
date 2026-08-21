'use client'

import { useEffect, useMemo, useState } from 'react'
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
import { isStaffRole, type UserRole } from '@/lib/access'
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  resolvePermissions,
  type Permission,
} from '@/lib/permissions'

export type StaffAssignableRole = Exclude<UserRole, 'PARTNER'>

export interface PermissionsEditableUser {
  id: string
  email: string | null
  role: StaffAssignableRole
  permissionsGrant: Permission[]
  permissionsDeny: Permission[]
}

const ROLE_OPTIONS: { value: StaffAssignableRole; label: string }[] = [
  { value: 'CLIENT', label: 'Client' },
  { value: 'FULFILLMENT', label: 'Fulfillment' },
  { value: 'BILLING', label: 'Billing' },
  { value: 'CATALOG', label: 'Catalog' },
  { value: 'FINANCE_VIEWER', label: 'Finance (read-only)' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
]

const triggerClass = 'bg-[#0a0e3a] border-white/10 text-white'
const labelClass = 'text-white/70 text-xs'

function toggleIn(list: Permission[], permission: Permission): Permission[] {
  return list.includes(permission)
    ? list.filter((p) => p !== permission)
    : [...list, permission]
}

/**
 * Super-admin dialog to change staff role + optional grant/deny overrides.
 */
export default function EditPermissionsDialog({
  open,
  onOpenChange,
  user,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: PermissionsEditableUser | null
  onSaved: () => void | Promise<void>
}) {
  const [role, setRole] = useState<StaffAssignableRole>('CLIENT')
  const [grant, setGrant] = useState<Permission[]>([])
  const [deny, setDeny] = useState<Permission[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && user) {
      setRole(user.role)
      setGrant(user.permissionsGrant ?? [])
      setDeny(user.permissionsDeny ?? [])
      setError(null)
    }
  }, [open, user])

  const effective = useMemo(
    () =>
      resolvePermissions({
        role,
        permissionsGrant: grant,
        permissionsDeny: deny,
      }),
    [role, grant, deny]
  )

  const showOverrides = isStaffRole(role) && role !== 'SUPER_ADMIN'

  async function submit() {
    if (!user) return
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          permissionsGrant: showOverrides ? grant : [],
          permissionsDeny: showOverrides ? deny : [],
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to update role')
      }
      await onSaved()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update role')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-brand-onyx border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Role & permissions</DialogTitle>
          <DialogDescription className="text-white/50">
            {user?.email || 'User'} — preset role plus optional grant/deny overrides.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className={labelClass}>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as StaffAssignableRole)}>
              <SelectTrigger className={triggerClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-brand-onyx border-white/10">
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className="text-white focus:bg-white/10"
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showOverrides && (
            <>
              <div className="space-y-2">
                <Label className={labelClass}>Grant (add to role defaults)</Label>
                <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto rounded-lg border border-white/10 p-2">
                  {PERMISSIONS.map((p) => (
                    <label
                      key={`g-${p}`}
                      className="flex items-center gap-2 text-sm text-white/80 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="rounded border-white/20"
                        checked={grant.includes(p)}
                        onChange={() => setGrant((prev) => toggleIn(prev, p))}
                      />
                      <span>{PERMISSION_LABELS[p]}</span>
                      <span className="text-white/30 text-xs">{p}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className={labelClass}>Deny (remove from effective set)</Label>
                <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto rounded-lg border border-white/10 p-2">
                  {PERMISSIONS.map((p) => (
                    <label
                      key={`d-${p}`}
                      className="flex items-center gap-2 text-sm text-white/80 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="rounded border-white/20"
                        checked={deny.includes(p)}
                        onChange={() => setDeny((prev) => toggleIn(prev, p))}
                      />
                      <span>{PERMISSION_LABELS[p]}</span>
                      <span className="text-white/30 text-xs">{p}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="text-xs text-white/50 mb-1.5">
              Effective permissions ({effective.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {effective.length === 0 ? (
                <span className="text-white/40 text-xs">None</span>
              ) : (
                effective.map((p) => (
                  <span
                    key={p}
                    className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70"
                  >
                    {p}
                  </span>
                ))
              )}
            </div>
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
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
