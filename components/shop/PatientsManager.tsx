'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AddressFields } from '@/components/AddressFields'
import type { Address } from '@/lib/address'
import { UserRound, Plus, Trash2, Pencil, Loader2 } from 'lucide-react'

interface Patient {
  id: string
  firstName: string
  lastName: string
  address: Address
  phone: string | null
  email: string | null
}

const emptyForm = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  address: { country: 'US' } as Partial<Address>,
}

/**
 * Manage the practice's saved patients (ship-to recipients) — list, add,
 * edit, remove. Used on the account page and reused at checkout.
 */
export function PatientsManager() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    fetch('/api/shop/patients')
      .then((r) => (r.ok ? r.json() : { patients: [] }))
      .then((data) => setPatients(data.patients ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const startEdit = (p: Patient) => {
    setEditingId(p.id)
    setForm({
      firstName: p.firstName,
      lastName: p.lastName,
      phone: p.phone ?? '',
      email: p.email ?? '',
      address: p.address,
    })
  }

  const startAdd = () => {
    setEditingId('new')
    setForm(emptyForm)
  }

  const save = async () => {
    setSaving(true)
    try {
      const body = {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address,
      }
      const res =
        editingId === 'new'
          ? await fetch('/api/shop/patients', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
          : await fetch(`/api/shop/patients/${editingId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
      if (res.ok) {
        setEditingId(null)
        setForm(emptyForm)
        load()
      }
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    await fetch(`/api/shop/patients/${id}`, { method: 'DELETE' })
    load()
  }

  const canSave = form.firstName && form.lastName && form.address.address1 && form.address.city &&
    form.address.state && form.address.zip

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex items-center justify-center py-8 text-white/40">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : patients.length === 0 && editingId === null ? (
        <div className="text-center py-6">
          <UserRound className="h-12 w-12 text-white/30 mx-auto mb-3" />
          <p className="text-white/60">No saved patients yet</p>
          <p className="text-sm text-white/40 mt-1">
            Add patients to ship orders directly to them at checkout.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {patients.map((p) => (
            <div
              key={p.id}
              className="p-4 border border-white/10 rounded-xl bg-white/5 space-y-2"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 text-white font-medium">
                  <UserRound className="h-4 w-4 text-white/60" />
                  {p.firstName} {p.lastName}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10"
                    onClick={() => startEdit(p)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/40 hover:text-red-400 hover:bg-red-500/10"
                    onClick={() => remove(p.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-white/50">
                {p.address.address1}
                {p.address.address2 ? `, ${p.address.address2}` : ''}
                <br />
                {p.address.city}, {p.address.state} {p.address.zip}
              </p>
            </div>
          ))}
        </div>
      )}

      {editingId !== null ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
          <div className="grid gap-4 grid-cols-2">
            <div className="space-y-2">
              <Label className="text-white/70">First Name *</Label>
              <Input
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">Last Name *</Label>
              <Input
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-white/70">Phone</Label>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="h-12 bg-white/5 border-white/10 text-white rounded-xl"
              />
            </div>
          </div>
          <AddressFields
            value={form.address}
            onChange={(addr) => setForm((f) => ({ ...f, address: addr }))}
            idPrefix={`patient-${editingId}`}
            dark
          />
          <div className="flex gap-2">
            <Button
              className="bg-[#213cef] hover:bg-[#1a30c0] text-white rounded-xl"
              onClick={save}
              disabled={saving || !canSave}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Patient'}
            </Button>
            <Button
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10 rounded-xl"
              onClick={() => {
                setEditingId(null)
                setForm(emptyForm)
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          className="border-white/20 text-white hover:bg-white/10"
          onClick={startAdd}
        >
          <Plus className="mr-2 h-4 w-4" /> Add Patient
        </Button>
      )}
    </div>
  )
}
