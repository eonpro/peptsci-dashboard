'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Store, Plus, ExternalLink, MoreHorizontal, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface StorefrontRow {
  id: string
  slug: string
  name: string
  status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED'
  createdAt: string
  client: { organizationName: string; contactEmail: string | null }
  _count: { products: number; retailOrders: number; endCustomers: number }
}

const STATUS_CONFIG = {
  ACTIVE: { label: 'Active', variant: 'default' as const, icon: CheckCircle2, color: 'text-emerald-400' },
  DRAFT: { label: 'Draft', variant: 'secondary' as const, icon: Clock, color: 'text-amber-400' },
  SUSPENDED: { label: 'Suspended', variant: 'destructive' as const, icon: XCircle, color: 'text-red-400' },
}

export default function StorefrontsPage() {
  const [storefronts, setStorefronts] = useState<StorefrontRow[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ clientId: '', slug: '', name: '' })
  const [creating, setCreating] = useState(false)
  const [clients, setClients] = useState<{ id: string; organizationName: string }[]>([])

  const fetchStorefronts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/storefronts')
      if (res.ok) setStorefronts(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/storefronts?_clients=1')
      if (!res.ok) return
    } catch {
      // clients list is optional enhancement
    }
  }, [])

  useEffect(() => {
    fetchStorefronts()
    fetchClients()
  }, [fetchStorefronts, fetchClients])

  async function handleCreate() {
    setCreating(true)
    try {
      const res = await fetch('/api/admin/storefronts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setCreateOpen(false)
        setForm({ clientId: '', slug: '', name: '' })
        fetchStorefronts()
      }
    } finally {
      setCreating(false)
    }
  }

  async function handleStatusChange(id: string, status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED') {
    await fetch(`/api/admin/storefronts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    fetchStorefronts()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">White-Label Storefronts</h1>
          <p className="text-sm text-white/60 mt-1">
            Manage clinic storefronts and their configurations
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-brand-primary hover:bg-[#1a30c0] text-white">
              <Plus className="h-4 w-4 mr-2" />
              New Storefront
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#0a0e3a] border-white/10 text-white">
            <DialogHeader>
              <DialogTitle>Create Storefront</DialogTitle>
              <DialogDescription className="text-white/60">
                Set up a new white-label storefront for a clinic.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Client ID</Label>
                <Input
                  placeholder="Client CUID (from Clients table)"
                  value={form.clientId}
                  onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                  className="bg-white/5 border-white/20 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Subdomain Slug</Label>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="drclinic"
                    value={form.slug}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                      }))
                    }
                    className="bg-white/5 border-white/20 text-white"
                  />
                  <span className="text-white/40 text-sm whitespace-nowrap">.peptsci.com</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Store Name</Label>
                <Input
                  placeholder="Dr. Clinic Wellness Shop"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="bg-white/5 border-white/20 text-white"
                />
              </div>
              <Button
                onClick={handleCreate}
                disabled={creating || !form.clientId || !form.slug || !form.name}
                className="w-full bg-brand-primary hover:bg-[#1a30c0]"
              >
                {creating ? 'Creating...' : 'Create Storefront'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-[#0a0e3a] border-white/10 animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-5 bg-white/10 rounded w-2/3" />
                <div className="h-4 bg-white/10 rounded w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="h-20 bg-white/5 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : storefronts.length === 0 ? (
        <Card className="bg-[#0a0e3a] border-white/10">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Store className="h-12 w-12 text-white/20 mb-4" />
            <h3 className="text-lg font-medium text-white/70">No storefronts yet</h3>
            <p className="text-sm text-white/40 mt-1">Create a storefront for a clinic to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {storefronts.map((sf) => {
            const statusCfg = STATUS_CONFIG[sf.status]
            const StatusIcon = statusCfg.icon
            return (
              <Card key={sf.id} className="bg-[#0a0e3a] border-white/10 hover:border-white/20 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-white text-lg">{sf.name}</CardTitle>
                      <CardDescription className="text-white/50">
                        {sf.client.organizationName}
                      </CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-white/50 hover:text-white hover:bg-white/10">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-[#0a0e3a] border-white/10 text-white">
                        {sf.status !== 'ACTIVE' && (
                          <DropdownMenuItem
                            onClick={() => handleStatusChange(sf.id, 'ACTIVE')}
                            className="hover:bg-white/10 focus:bg-white/10 focus:text-white cursor-pointer"
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-400" />
                            Activate
                          </DropdownMenuItem>
                        )}
                        {sf.status !== 'SUSPENDED' && (
                          <DropdownMenuItem
                            onClick={() => handleStatusChange(sf.id, 'SUSPENDED')}
                            className="hover:bg-white/10 focus:bg-white/10 focus:text-white cursor-pointer"
                          >
                            <XCircle className="mr-2 h-4 w-4 text-red-400" />
                            Suspend
                          </DropdownMenuItem>
                        )}
                        {sf.status !== 'DRAFT' && (
                          <DropdownMenuItem
                            onClick={() => handleStatusChange(sf.id, 'DRAFT')}
                            className="hover:bg-white/10 focus:bg-white/10 focus:text-white cursor-pointer"
                          >
                            <Clock className="mr-2 h-4 w-4 text-amber-400" />
                            Set to Draft
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant={statusCfg.variant} className="text-xs">
                      <StatusIcon className={`h-3 w-3 mr-1 ${statusCfg.color}`} />
                      {statusCfg.label}
                    </Badge>
                    <span className="text-xs text-white/30">
                      {sf.slug}.peptsci.com
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="text-center p-2 rounded-lg bg-white/5">
                      <p className="text-lg font-semibold text-white">{sf._count.products}</p>
                      <p className="text-xs text-white/40">Products</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-white/5">
                      <p className="text-lg font-semibold text-white">{sf._count.retailOrders}</p>
                      <p className="text-xs text-white/40">Orders</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-white/5">
                      <p className="text-lg font-semibold text-white">{sf._count.endCustomers}</p>
                      <p className="text-xs text-white/40">Customers</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/storefronts/${sf.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full border-white/20 text-white hover:bg-white/10">
                        Manage
                      </Button>
                    </Link>
                    {sf.status === 'ACTIVE' && (
                      <a
                        href={`https://${sf.slug}.peptsci.com`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="ghost" size="sm" className="text-white/50 hover:text-white hover:bg-white/10">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
