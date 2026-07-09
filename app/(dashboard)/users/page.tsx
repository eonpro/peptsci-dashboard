'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRole } from '@/hooks/useRole'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Users as UsersIcon,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Ban,
  ShieldCheck,
  UserPlus,
  Pencil,
  Mail,
  X,
} from 'lucide-react'
import InviteUserDialog, { type ClientOption } from './InviteUserDialog'
import EditUserDialog, { type EditableUser } from './EditUserDialog'

type Role = 'CLIENT' | 'ADMIN' | 'SUPER_ADMIN'
type Status = 'PENDING' | 'ACTIVE' | 'SUSPENDED'

interface PlatformUser {
  id: string
  email: string | null
  firstName: string | null
  lastName: string | null
  imageUrl: string | null
  role: Role
  status: Status
  clientId: string | null
  createdAt: number
  lastSignInAt: number | null
}

interface PendingInvite {
  id: string
  email: string
  role: string
  clientId: string | null
  status: string
  createdAt: number
}

const statusStyles: Record<Status, string> = {
  ACTIVE: 'border-green-500/30 text-green-400 bg-green-500/10',
  PENDING: 'border-amber-500/30 text-amber-400 bg-amber-500/10',
  SUSPENDED: 'border-red-500/30 text-red-400 bg-red-500/10',
}

export default function UsersPage() {
  const { isSuperAdmin } = useRole()
  const [users, setUsers] = useState<PlatformUser[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [editUser, setEditUser] = useState<EditableUser | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/users')
      if (!res.ok) throw new Error('Failed to load users')
      const data = await res.json()
      setUsers(data.users ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadInvites = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users/invite')
      if (!res.ok) return
      const data = await res.json()
      setInvites(data.invitations ?? [])
    } catch {
      /* non-fatal */
    }
  }, [])

  const loadClients = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/clients')
      if (!res.ok) return
      const data = await res.json()
      setClients(
        (data.clients ?? []).map((c: { id: string; organizationName: string }) => ({
          id: c.id,
          organizationName: c.organizationName,
        }))
      )
    } catch {
      /* non-fatal */
    }
  }, [])

  useEffect(() => {
    load()
    loadInvites()
    loadClients()
  }, [load, loadInvites, loadClients])

  const clientNameById = useMemo(() => {
    const map = new Map<string, string>()
    clients.forEach((c) => map.set(c.id, c.organizationName))
    return map
  }, [clients])

  const filtered = useMemo(() => {
    const term = search.toLowerCase()
    return users.filter(
      (u) =>
        (u.email || '').toLowerCase().includes(term) ||
        `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase().includes(term)
    )
  }, [users, search])

  const pendingCount = users.filter((u) => u.status === 'PENDING').length

  async function patchStatus(id: string, action: 'approve' | 'suspend') {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${id}/approve`, {
        method: action === 'approve' ? 'POST' : 'DELETE',
      })
      if (!res.ok) throw new Error('Action failed')
      setUsers((prev) =>
        prev.map((u) =>
          u.id === id ? { ...u, status: action === 'approve' ? 'ACTIVE' : 'SUSPENDED' } : u
        )
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  async function changeRole(id: string, role: Role) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || 'Failed to change role')
      }
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to change role')
    } finally {
      setBusyId(null)
    }
  }

  async function revokeInvite(id: string) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/invite?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to revoke invitation')
      setInvites((prev) => prev.filter((i) => i.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke invitation')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-white/60 text-sm">Invite members, manage access and roles</p>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Badge variant="outline" className={statusStyles.PENDING}>
              {pendingCount} pending approval
            </Badge>
          )}
          <Button
            onClick={() => setInviteOpen(true)}
            className="bg-brand-primary hover:bg-[#1a30c0] text-white"
          >
            <UserPlus className="h-4 w-4 mr-2" /> Invite User
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Pending invitations */}
      {invites.length > 0 && (
        <Card className="bg-[#0a0e3a]/50 border-white/10 overflow-hidden">
          <CardHeader className="bg-brand-onyx/50 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="bg-amber-500/20 p-2 rounded-lg">
                <Mail className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <CardTitle className="text-white">Pending Invitations</CardTitle>
                <CardDescription className="text-white/50">
                  {invites.length} awaiting sign-up
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-white/60">Email</TableHead>
                  <TableHead className="text-white/60">Role</TableHead>
                  <TableHead className="text-white/60">Practice</TableHead>
                  <TableHead className="text-white/60 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((inv) => {
                  const busy = busyId === inv.id
                  return (
                    <TableRow key={inv.id} className="border-white/5 hover:bg-white/5">
                      <TableCell className="text-white">{inv.email}</TableCell>
                      <TableCell className="text-white/80">{inv.role}</TableCell>
                      <TableCell className="text-white/60">
                        {inv.clientId ? clientNameById.get(inv.clientId) ?? '—' : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                          onClick={() => revokeInvite(inv.id)}
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <X className="h-3.5 w-3.5 mr-1" />
                          )}
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-[#0a0e3a] border-white/10 text-white placeholder:text-white/40"
        />
      </div>

      <Card className="bg-[#0a0e3a]/50 border-white/10 overflow-hidden">
        <CardHeader className="bg-brand-onyx/50 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="bg-brand-primary/20 p-2 rounded-lg">
              <UsersIcon className="h-5 w-5 text-brand-primary" />
            </div>
            <div>
              <CardTitle className="text-white">Members</CardTitle>
              <CardDescription className="text-white/50">
                {users.length} total user{users.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-white/60">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading users...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-white/50">
              <UsersIcon className="h-8 w-8 mb-3 text-white/30" />
              No users found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-white/60">User</TableHead>
                  <TableHead className="text-white/60">Practice</TableHead>
                  <TableHead className="text-white/60">Role</TableHead>
                  <TableHead className="text-white/60">Status</TableHead>
                  <TableHead className="text-white/60 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => {
                  const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || '—'
                  const busy = busyId === u.id
                  return (
                    <TableRow key={u.id} className="border-white/5 hover:bg-white/5">
                      <TableCell>
                        <div className="text-white font-medium">{name}</div>
                        <div className="text-white/50 text-sm">{u.email || '—'}</div>
                      </TableCell>
                      <TableCell className="text-white/70 text-sm">
                        {u.clientId ? clientNameById.get(u.clientId) ?? '—' : '—'}
                      </TableCell>
                      <TableCell>
                        {isSuperAdmin ? (
                          <Select
                            value={u.role}
                            onValueChange={(v) => changeRole(u.id, v as Role)}
                            disabled={busy}
                          >
                            <SelectTrigger className="w-[150px] bg-[#0a0e3a] border-white/10 text-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-brand-onyx border-white/10">
                              <SelectItem value="CLIENT" className="text-white focus:bg-white/10">
                                Client
                              </SelectItem>
                              <SelectItem value="ADMIN" className="text-white focus:bg-white/10">
                                Admin
                              </SelectItem>
                              <SelectItem
                                value="SUPER_ADMIN"
                                className="text-white focus:bg-white/10"
                              >
                                Super Admin
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-white/80">
                            {(u.role === 'ADMIN' || u.role === 'SUPER_ADMIN') && (
                              <ShieldCheck className="h-3.5 w-3.5 text-brand-primary" />
                            )}
                            {u.role}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusStyles[u.status]}>
                          {u.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
                            onClick={() =>
                              setEditUser({
                                id: u.id,
                                email: u.email,
                                firstName: u.firstName,
                                lastName: u.lastName,
                                status: u.status,
                                clientId: u.clientId,
                              })
                            }
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1" />
                            Edit
                          </Button>
                          {u.status !== 'ACTIVE' && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              className="border-green-500/30 text-green-400 hover:bg-green-500/10 hover:text-green-300"
                              onClick={() => patchStatus(u.id, 'approve')}
                            >
                              {busy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                              )}
                              Approve
                            </Button>
                          )}
                          {u.status !== 'SUSPENDED' && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                              onClick={() => patchStatus(u.id, 'suspend')}
                            >
                              <Ban className="h-3.5 w-3.5 mr-1" />
                              Suspend
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        clients={clients}
        isSuperAdmin={isSuperAdmin}
        onInvited={loadInvites}
      />
      <EditUserDialog
        open={editUser !== null}
        onOpenChange={(o) => {
          if (!o) setEditUser(null)
        }}
        user={editUser}
        clients={clients}
        onSaved={load}
      />
    </div>
  )
}
