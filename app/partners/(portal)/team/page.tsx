'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface Member {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'VIEWER'
  status: string
  hasLogin: boolean
}

export default function PartnerTeamPage() {
  const [owner, setOwner] = useState<{ email: string; name: string | null } | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/partners/team')
      const data = await res.json()
      if (res.ok) {
        setOwner(data.owner)
        setMembers(data.members)
      } else {
        toast.error(data.message || 'Failed to load team')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    setInviting(true)
    try {
      const res = await fetch('/api/partners/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          email: form.get('email'),
          role: form.get('role') || 'VIEWER',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || 'Failed to invite teammate')
        return
      }
      toast.success('Teammate invited')
      formEl.reset()
      void load()
    } finally {
      setInviting(false)
    }
  }

  async function update(memberId: string, patch: { role?: 'ADMIN' | 'VIEWER'; status?: 'ACTIVE' | 'SUSPENDED' }) {
    const res = await fetch('/api/partners/team', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, ...patch }),
    })
    if (res.ok) {
      toast.success('Teammate updated')
      void load()
    } else {
      toast.error('Failed to update teammate')
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Team</h1>
        <p className="text-sm text-slate-500">
          Give teammates access to your partner portal. Admins can manage reps, links, and pricing;
          viewers see numbers only.
        </p>
      </div>

      <form onSubmit={invite} className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-4">
        <Input name="name" required placeholder="Full name *" aria-label="Full name" className="w-auto bg-white" />
        <Input name="email" type="email" required placeholder="Email *" aria-label="Email" className="w-auto bg-white" />
        {/* Native select: this form is read via FormData by name, which Radix
            Select doesn't participate in. */}
        <select
          name="role"
          aria-label="Role"
          className="h-10 rounded-md border border-input bg-white px-3 text-sm"
        >
          <option value="VIEWER">Viewer</option>
          <option value="ADMIN">Admin</option>
        </select>
        <Button type="submit" disabled={inviting} className="font-semibold">
          {inviting ? 'Inviting…' : 'Invite teammate'}
        </Button>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-xs uppercase tracking-wide">Name</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Email</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Role</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
              <TableHead className="text-xs uppercase tracking-wide" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {owner && (
              <TableRow className="bg-slate-50/50">
                <TableCell className="py-3 font-medium">{owner.name || 'Account owner'}</TableCell>
                <TableCell className="py-3">{owner.email}</TableCell>
                <TableCell className="py-3">Owner</TableCell>
                <TableCell className="py-3">—</TableCell>
                <TableCell />
              </TableRow>
            )}
            {loading &&
              [0, 1].map((i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5} className="py-3">
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!loading && members.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <EmptyState
                    icon={Users}
                    title="No teammates yet"
                    description="Invite your first teammate above — they'll get an email to set up their login."
                    className="py-6"
                  />
                </TableCell>
              </TableRow>
            )}
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="py-3">{m.name}</TableCell>
                <TableCell className="py-3">{m.email}</TableCell>
                <TableCell className="py-3">
                  <Select
                    value={m.role}
                    onValueChange={(value) => void update(m.id, { role: value as 'ADMIN' | 'VIEWER' })}
                  >
                    <SelectTrigger className="h-8 w-28 bg-white text-xs" aria-label={`Role for ${m.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VIEWER">Viewer</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="py-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      'font-medium',
                      m.status === 'ACTIVE'
                        ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                        : m.status === 'PENDING'
                          ? 'border-amber-200 bg-amber-100 text-amber-700'
                          : 'border-red-200 bg-red-100 text-red-600'
                    )}
                  >
                    {m.status === 'PENDING' ? 'Invite sent' : m.status}
                  </Badge>
                </TableCell>
                <TableCell className="py-3 text-right">
                  {m.status !== 'PENDING' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-sm font-normal text-slate-500 hover:bg-transparent hover:underline"
                      onClick={() =>
                        void update(m.id, { status: m.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })
                      }
                    >
                      {m.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
