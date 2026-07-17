'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

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
        <input name="name" required placeholder="Full name *" className="rounded-md border px-3 py-2 text-sm" />
        <input name="email" type="email" required placeholder="Email *" className="rounded-md border px-3 py-2 text-sm" />
        <select name="role" className="rounded-md border px-3 py-2 text-sm">
          <option value="VIEWER">Viewer</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button
          type="submit"
          disabled={inviting}
          className="rounded-lg bg-[#213cef] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a30c4] disabled:opacity-60"
        >
          {inviting ? 'Inviting…' : 'Invite teammate'}
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {owner && (
              <tr className="border-b bg-slate-50/50">
                <td className="px-4 py-3 font-medium">{owner.name || 'Account owner'}</td>
                <td className="px-4 py-3">{owner.email}</td>
                <td className="px-4 py-3">Owner</td>
                <td className="px-4 py-3">—</td>
                <td />
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">Loading…</td>
              </tr>
            )}
            {members.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="px-4 py-3">{m.name}</td>
                <td className="px-4 py-3">{m.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={m.role}
                    onChange={(e) => void update(m.id, { role: e.target.value as 'ADMIN' | 'VIEWER' })}
                    className="rounded-md border px-2 py-1 text-xs"
                  >
                    <option value="VIEWER">Viewer</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      m.status === 'ACTIVE'
                        ? 'bg-emerald-100 text-emerald-700'
                        : m.status === 'PENDING'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-600'
                    }`}
                  >
                    {m.status === 'PENDING' ? 'Invite sent' : m.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {m.status !== 'PENDING' && (
                    <button
                      onClick={() =>
                        void update(m.id, { status: m.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })
                      }
                      className="text-sm text-slate-500 hover:underline"
                    >
                      {m.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
